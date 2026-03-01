import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"

import { parseWeathernewsSpotForecastHtml } from "./weathernewsSpotForecastParser.mjs"

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function isPlainObject(value) {
  return typeof value === "object" && value != null && !Array.isArray(value)
}

function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10)
}

const predictSourceKeys = ["weathernews", "jmc"]

function normalizePredictSources(value, ctx) {
  if (value == null) return null
  assert(isPlainObject(value), `Invalid ${ctx} (expected object)`)

  const keys = Object.keys(value)
  assert(keys.length > 0, `Empty ${ctx}`)
  for (const key of keys) {
    assert(predictSourceKeys.includes(key), `Unexpected key "${key}" in ${ctx}`)
  }

  const sources = {}

  if ("weathernews" in value) {
    assert(
      isPlainObject(value.weathernews),
      `Invalid ${ctx}.weathernews (expected object)`,
    )
    sources.weathernews = value.weathernews
  }

  if ("jmc" in value) {
    assert(
      isPlainObject(value.jmc),
      `Invalid ${ctx}.jmc (expected object)`,
    )
    sources.jmc = value.jmc
  }

  assert(Object.keys(sources).length > 0, `Predict object has no sources in ${ctx}`)
  return sources
}

async function tryReadFile(filePath) {
  try {
    return await readFile(filePath, "utf8")
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null
    throw error
  }
}

async function fetchTextWithRetry(url, { retries = 2 } = {}) {
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml",
        },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return await response.text()
    } catch (error) {
      lastError = error
      const delayMs = 250 * Math.pow(2, attempt)
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastError
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length)
  let nextIndex = 0

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const index = nextIndex++
        if (index >= items.length) break
        results[index] = await fn(items[index], index)
      }
    },
  )

  await Promise.all(workers)
  return results
}

async function buildPrefecturePredictFile({ fileName, raw, existingRaw }) {
  const parsed = parseYaml(raw)
  assert(isPlainObject(parsed), `Invalid YAML root object in ${fileName}`)
  assert(isPlainObject(parsed.prefecture), `Missing "prefecture" in ${fileName}`)
  assert(Array.isArray(parsed.spots), `Missing "spots" array in ${fileName}`)

  const prefecture = parsed.prefecture
  assert(Number.isInteger(prefecture.id), `Invalid prefecture.id in ${fileName}`)
  assert(isNonEmptyString(prefecture.name_ja), `Invalid prefecture.name_ja in ${fileName}`)

  const existingPredictBySpotId = new Map()
  if (existingRaw) {
    const existingParsed = parseYaml(existingRaw)
    assert(
      isPlainObject(existingParsed),
      `Invalid YAML root object in spots_predict/${fileName}`,
    )
    assert(
      Array.isArray(existingParsed.spots),
      `Missing "spots" array in spots_predict/${fileName}`,
    )
    for (const spot of existingParsed.spots) {
      assert(isPlainObject(spot), `Invalid spot entry in spots_predict/${fileName}`)
      assert(isNonEmptyString(spot.id), `Invalid spot.id in spots_predict/${fileName}`)
      const normalized = normalizePredictSources(
        spot.predict,
        `spot.predict in spots_predict/${fileName} (${spot.id})`,
      )
      if (normalized) existingPredictBySpotId.set(spot.id, normalized)
    }
  }

  const spots = parsed.spots
  const tasks = spots.map((spot) => {
    assert(isPlainObject(spot), `Invalid spot entry in ${fileName}`)
    assert(isNonEmptyString(spot.id), `Invalid spot.id in ${fileName}`)

    const weathernews = spot.links?.weathernews
    const weathernewsUrl = isNonEmptyString(weathernews) ? weathernews.trim() : null
    return { id: spot.id, weathernewsUrl }
  })

  const fetched = await mapWithConcurrency(tasks, 8, async (task) => {
    if (!task.weathernewsUrl) {
      return { id: task.id, weathernewsPredict: null, keepExisting: false }
    }

    try {
      const html = await fetchTextWithRetry(task.weathernewsUrl)
      const parsedPredict = parseWeathernewsSpotForecastHtml(html)
      return { id: task.id, weathernewsPredict: parsedPredict, keepExisting: false }
    } catch (error) {
      console.warn(
        `[warn] ${fileName} ${task.id} failed to fetch/parse: ${task.weathernewsUrl} (${error instanceof Error ? error.message : String(error)})`,
      )
      return { id: task.id, weathernewsPredict: null, keepExisting: true }
    }
  })

  const hadFailure = fetched.some((r) => r.keepExisting)

  const predictSpots = fetched.map((result) => {
    const existing = existingPredictBySpotId.get(result.id) ?? null

    if (result.keepExisting) {
      if (!existing) return { id: result.id }
      return { id: result.id, predict: existing }
    }

    const merged = existing ? { ...existing } : {}
    if (result.weathernewsPredict) {
      merged.weathernews = result.weathernewsPredict
    } else {
      delete merged.weathernews
    }

    const predict = {}
    if (merged.weathernews) predict.weathernews = merged.weathernews
    if (merged.jmc) predict.jmc = merged.jmc

    return Object.keys(predict).length > 0 ? { id: result.id, predict } : { id: result.id }
  })

  return {
    file: {
      prefecture: {
        id: prefecture.id,
        name_ja: prefecture.name_ja,
        ...(isNonEmptyString(prefecture.name_en)
          ? { name_en: prefecture.name_en }
          : {}),
      },
      spots: predictSpots,
    },
    hadFailure,
  }
}

async function main() {
  const spotsDir = path.join(process.cwd(), "src", "data", "spots")
  const outputDir = path.join(process.cwd(), "src", "data", "spots_predict")
  const existingDir = outputDir
  const fetchedAt = todayIsoUtc()

  const fileNames = (await readdir(spotsDir)).filter((f) => f.endsWith(".yml")).sort()
  assert(fileNames.length === 47, `Expected 47 spots yml files, got ${fileNames.length}`)

  await mkdir(outputDir, { recursive: true })

  let prefectureCount = 0
  let spotCount = 0
  let predictedSpotCount = 0
  let failureCount = 0

  for (const fileName of fileNames) {
    const filePath = path.join(spotsDir, fileName)
    const raw = await readFile(filePath, "utf8")

    const existingRaw = await tryReadFile(path.join(existingDir, fileName))
    const predictFile = await buildPrefecturePredictFile({
      fileName,
      raw,
      existingRaw,
    })

    const outPath = path.join(outputDir, fileName)
    const yaml = stringifyYaml(predictFile.file, { indent: 2 })
    await writeFile(outPath, yaml)

    prefectureCount++
    spotCount += predictFile.file.spots.length
    predictedSpotCount += predictFile.file.spots.filter((s) => s.predict?.weathernews)
      .length
    if (predictFile.hadFailure) failureCount++

    console.log(
      `Updated ${path.relative(process.cwd(), outPath)} (${predictFile.file.spots.length} spots)`,
    )
  }

  console.log(
    `Done: ${prefectureCount} prefectures, ${spotCount} spots, ${predictedSpotCount} predictions (fetched_at=${fetchedAt})`,
  )

  if (failureCount > 0) {
    console.warn(
      `[warn] ${failureCount} prefectures had fetch/parse failures; keeping existing predict.weathernews for those spots`,
    )
    process.exitCode = 1
  }
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
