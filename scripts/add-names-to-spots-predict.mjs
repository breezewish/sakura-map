import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function isPlainObject(value) {
  return typeof value === "object" && value != null && !Array.isArray(value)
}

function parseSpotNamesById(raw, fileName) {
  const parsed = parseYaml(raw)
  assert(isPlainObject(parsed), `Invalid YAML root object in spots/${fileName}`)
  assert(Array.isArray(parsed.spots), `Missing "spots" array in spots/${fileName}`)

  const namesById = new Map()

  for (const spot of parsed.spots) {
    assert(isPlainObject(spot), `Invalid spot entry in spots/${fileName}`)
    assert(isNonEmptyString(spot.id), `Invalid spot.id in spots/${fileName}`)
    assert(isNonEmptyString(spot.name_ja), `Invalid spot.name_ja in spots/${fileName} (${spot.id})`)
    assert(!namesById.has(spot.id), `Duplicate spot.id "${spot.id}" in spots/${fileName}`)
    namesById.set(spot.id, spot.name_ja.trim())
  }

  return namesById
}

function buildPredictFileWithNames({ spotRaw, predictRaw, fileName }) {
  const spotNamesById = parseSpotNamesById(spotRaw, fileName)

  const parsed = parseYaml(predictRaw)
  assert(isPlainObject(parsed), `Invalid YAML root object in spots_predict/${fileName}`)
  assert(isPlainObject(parsed.prefecture), `Missing "prefecture" in spots_predict/${fileName}`)
  assert(Array.isArray(parsed.spots), `Missing "spots" array in spots_predict/${fileName}`)
  assert(
    parsed.spots.length === spotNamesById.size,
    `Spot count mismatch between spots/${fileName} and spots_predict/${fileName}`,
  )

  const spots = parsed.spots.map((spot) => {
    assert(isPlainObject(spot), `Invalid spot entry in spots_predict/${fileName}`)
    assert(isNonEmptyString(spot.id), `Invalid spot.id in spots_predict/${fileName}`)
    assert(
      spotNamesById.has(spot.id),
      `Spot "${spot.id}" in spots_predict/${fileName} does not exist in spots/${fileName}`,
    )

    const normalized = {
      id: spot.id,
      name: spotNamesById.get(spot.id),
      ...(spot.predict ? { predict: spot.predict } : {}),
    }

    return normalized
  })

  return {
    prefecture: parsed.prefecture,
    spots,
  }
}

async function main() {
  const dataDir = path.join(process.cwd(), "src", "data")
  const spotsDir = path.join(dataDir, "spots")
  const predictDir = path.join(dataDir, "spots_predict")

  const predictFileNames = (await readdir(predictDir)).filter((f) => f.endsWith(".yml")).sort()
  assert(predictFileNames.length > 0, `No predict files found in ${path.relative(process.cwd(), predictDir)}`)

  let updatedFileCount = 0
  let updatedSpotCount = 0

  for (const fileName of predictFileNames) {
    const [spotRaw, predictRaw] = await Promise.all([
      readFile(path.join(spotsDir, fileName), "utf8"),
      readFile(path.join(predictDir, fileName), "utf8"),
    ])

    const nextFile = buildPredictFileWithNames({ spotRaw, predictRaw, fileName })
    const nextYaml = stringifyYaml(nextFile, { indent: 2 })

    if (predictRaw === nextYaml) continue

    await writeFile(path.join(predictDir, fileName), nextYaml)
    updatedFileCount += 1
    updatedSpotCount += nextFile.spots.length
    console.log(`Updated ${path.relative(process.cwd(), path.join(predictDir, fileName))}`)
  }

  console.log(
    `Done: ${updatedFileCount} files updated, ${updatedSpotCount} spots now include readability names`,
  )
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
