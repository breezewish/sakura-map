import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { parse as parseYaml } from "yaml"

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function isPlainObject(value) {
  return typeof value === "object" && value != null && !Array.isArray(value)
}

function isIsoDateString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

const predictionDateKeys = [
  "forecasted_at",
  "first_bloom_date",
  "full_bloom_date",
  "fubuki_date",
]

const predictSourceKeys = ["weathernews", "jmc"]

function pickPredictionDates(raw, ctx) {
  assert(isPlainObject(raw), `Invalid ${ctx} (expected object)`)

  for (const key of Object.keys(raw)) {
    assert(
      predictionDateKeys.includes(key),
      `Unexpected key "${key}" in ${ctx}`,
    )
  }

  const picked = {}
  for (const key of predictionDateKeys) {
    if (raw[key] == null) continue
    assert(isIsoDateString(raw[key]), `Invalid ${ctx}.${key} (expected ISO date)`)
    picked[key] = raw[key]
  }

  return Object.keys(picked).length > 0 ? picked : null
}

function normalizePredict(raw, ctx) {
  if (!isPlainObject(raw)) return null

  const hasSourceKey = predictSourceKeys.some((k) => k in raw)
  if (hasSourceKey) {
    for (const key of Object.keys(raw)) {
      assert(
        predictSourceKeys.includes(key),
        `Unexpected key "${key}" in ${ctx}`,
      )
    }

    const sources = {}
    for (const sourceKey of predictSourceKeys) {
      if (raw[sourceKey] == null) continue
      const dates = pickPredictionDates(raw[sourceKey], `${ctx}.${sourceKey}`)
      if (dates) sources[sourceKey] = dates
    }

    return Object.keys(sources).length > 0 ? sources : null
  }

  const legacyDates = pickPredictionDates(raw, ctx)
  return legacyDates ? { weathernews: legacyDates } : null
}

async function tryReadSortedYmlFiles(dir) {
  try {
    return (await readdir(dir))
      .filter((f) => f.endsWith(".yml"))
      .sort()
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return []
    throw error
  }
}

async function buildSpotsDatasetJson() {
  const spotsDir = path.join(process.cwd(), "src", "data", "spots")
  const spotsPredictDir = path.join(process.cwd(), "src", "data", "spots_predict")
  const outputDir = path.join(process.cwd(), "public", "data")
  const outputFile = path.join(outputDir, "spots.json")

  const fileNames = await tryReadSortedYmlFiles(spotsDir)

  const prefectures = []
  const spots = []
  const spotIdToFile = new Map()

  const predictFileNames = await tryReadSortedYmlFiles(spotsPredictDir)
  const predictedSpotIdToFile = new Map()
  const predictedBySpotId = new Map()

  for (const fileName of predictFileNames) {
    const filePath = path.join(spotsPredictDir, fileName)
    const raw = await readFile(filePath, "utf8")
    const parsed = parseYaml(raw)

    assert(isPlainObject(parsed), `Invalid YAML root object in ${fileName}`)
    assert(
      isPlainObject(parsed.prefecture),
      `Missing "prefecture" in ${fileName}`,
    )
    assert(
      Number.isInteger(parsed.prefecture.id),
      `Invalid prefecture.id in ${fileName}`,
    )
    assert(
      isNonEmptyString(parsed.prefecture.name_ja),
      `Invalid prefecture.name_ja in ${fileName}`,
    )
    assert(Array.isArray(parsed.spots), `Missing "spots" array in ${fileName}`)

    for (const spot of parsed.spots) {
      assert(isPlainObject(spot), `Invalid spot entry in ${fileName}`)
      assert(isNonEmptyString(spot.id), `Invalid spot.id in ${fileName}`)

      const existing = predictedSpotIdToFile.get(spot.id)
      assert(
        !existing,
        `Duplicate predicted spot id "${spot.id}" found in ${fileName} (already defined in ${existing})`,
      )
      predictedSpotIdToFile.set(spot.id, fileName)

      if (!isPlainObject(spot.predict)) continue

      const predict = normalizePredict(
        spot.predict,
        `spot.predict in ${fileName} (${spot.id})`,
      )
      if (predict) predictedBySpotId.set(spot.id, predict)
    }
  }

  for (const fileName of fileNames) {
    const filePath = path.join(spotsDir, fileName)
    const raw = await readFile(filePath, "utf8")
    const parsed = parseYaml(raw)

    assert(isPlainObject(parsed), `Invalid YAML root object in ${fileName}`)
    assert(
      isPlainObject(parsed.prefecture),
      `Missing "prefecture" in ${fileName}`,
    )
    assert(
      Number.isInteger(parsed.prefecture.id),
      `Invalid prefecture.id in ${fileName}`,
    )
    assert(
      isNonEmptyString(parsed.prefecture.name_ja),
      `Invalid prefecture.name_ja in ${fileName}`,
    )
    assert(Array.isArray(parsed.spots), `Missing "spots" array in ${fileName}`)

    const prefecture = parsed.prefecture
    prefectures.push(prefecture)

    for (const spot of parsed.spots) {
      assert(isPlainObject(spot), `Invalid spot entry in ${fileName}`)
      assert(isNonEmptyString(spot.id), `Invalid spot.id in ${fileName}`)

      const existing = spotIdToFile.get(spot.id)
      assert(
        !existing,
        `Duplicate spot id "${spot.id}" found in ${fileName} (already defined in ${existing})`,
      )
      spotIdToFile.set(spot.id, fileName)

      const predict = predictedBySpotId.get(spot.id)
      spots.push({ ...spot, prefecture, ...(predict ? { predict } : {}) })
    }
  }

  prefectures.sort((a, b) => a.id - b.id)
  spots.sort((a, b) => a.prefecture.id - b.prefecture.id)

  await mkdir(outputDir, { recursive: true })
  await writeFile(outputFile, JSON.stringify({ prefectures, spots }))

  return {
    outputFile,
    prefectureCount: prefectures.length,
    spotCount: spots.length,
    predictedSpotCount: predictedBySpotId.size,
  }
}

try {
  const result = await buildSpotsDatasetJson()
  const rel = path.relative(process.cwd(), result.outputFile)
  console.log(
    `Generated ${rel} (${result.prefectureCount} prefectures, ${result.spotCount} spots, ${result.predictedSpotCount} predictions)`,
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
