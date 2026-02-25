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

async function buildPrefecturePredictFile({ fileName, raw, forecastedAt }) {
  const parsed = parseYaml(raw)
  assert(isPlainObject(parsed), `Invalid YAML root object in ${fileName}`)
  assert(isPlainObject(parsed.prefecture), `Missing "prefecture" in ${fileName}`)
  assert(Array.isArray(parsed.spots), `Missing "spots" array in ${fileName}`)

  const prefecture = parsed.prefecture
  assert(Number.isInteger(prefecture.id), `Invalid prefecture.id in ${fileName}`)
  assert(isNonEmptyString(prefecture.name_ja), `Invalid prefecture.name_ja in ${fileName}`)

  const spots = parsed.spots
  const tasks = spots.map((spot) => {
    assert(isPlainObject(spot), `Invalid spot entry in ${fileName}`)
    assert(isNonEmptyString(spot.id), `Invalid spot.id in ${fileName}`)

    const weathernews = spot.links?.weathernews
    const weathernewsUrl = isNonEmptyString(weathernews) ? weathernews.trim() : null
    return { id: spot.id, weathernewsUrl }
  })

  const fetched = await mapWithConcurrency(tasks, 8, async (task) => {
    if (!task.weathernewsUrl) return { id: task.id, predict: undefined }

    try {
      const html = await fetchTextWithRetry(task.weathernewsUrl)
      const parsedPredict = parseWeathernewsSpotForecastHtml(html)
      if (!parsedPredict) return { id: task.id, predict: undefined }

      return {
        id: task.id,
        predict: {
          forecasted_at: forecastedAt,
          first_bloom_date: parsedPredict.first_bloom_date,
          full_bloom_date: parsedPredict.full_bloom_date,
          fubuki_date: parsedPredict.fubuki_date,
        },
      }
    } catch (error) {
      console.warn(
        `[warn] ${fileName} ${task.id} failed to fetch/parse: ${task.weathernewsUrl} (${error instanceof Error ? error.message : String(error)})`,
      )
      return { id: task.id, predict: undefined }
    }
  })

  const predictSpots = fetched.map((p) => (p.predict ? p : { id: p.id }))

  return {
    prefecture: {
      id: prefecture.id,
      name_ja: prefecture.name_ja,
      ...(isNonEmptyString(prefecture.name_en) ? { name_en: prefecture.name_en } : {}),
    },
    spots: predictSpots,
  }
}

async function main() {
  const spotsDir = path.join(process.cwd(), "src", "data", "spots")
  const outputDir = path.join(process.cwd(), "src", "data", "spots_predict")
  const forecastedAt = todayIsoUtc()

  const fileNames = (await readdir(spotsDir)).filter((f) => f.endsWith(".yml")).sort()
  assert(fileNames.length === 47, `Expected 47 spots yml files, got ${fileNames.length}`)

  await mkdir(outputDir, { recursive: true })

  let prefectureCount = 0
  let spotCount = 0
  let predictedSpotCount = 0

  for (const fileName of fileNames) {
    const filePath = path.join(spotsDir, fileName)
    const raw = await readFile(filePath, "utf8")

    const predictFile = await buildPrefecturePredictFile({
      fileName,
      raw,
      forecastedAt,
    })

    const outPath = path.join(outputDir, fileName)
    const yaml = stringifyYaml(predictFile, { indent: 2 })
    await writeFile(outPath, yaml)

    prefectureCount++
    spotCount += predictFile.spots.length
    predictedSpotCount += predictFile.spots.filter((s) => s.predict).length

    console.log(
      `Updated ${path.relative(process.cwd(), outPath)} (${predictFile.spots.length} spots)`,
    )
  }

  console.log(
    `Done: ${prefectureCount} prefectures, ${spotCount} spots, ${predictedSpotCount} predictions (forecasted_at=${forecastedAt})`,
  )
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

