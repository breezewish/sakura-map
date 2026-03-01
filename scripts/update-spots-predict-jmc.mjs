import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"

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

function isIsoDateString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function pad2(value) {
  return String(value).padStart(2, "0")
}

function isoDateFromJstDateTime(value, ctx) {
  assert(isNonEmptyString(value), `Invalid ${ctx} (expected non-empty string)`)
  // Example: 2026-02-26T00:00:00+09:00
  const date = value.slice(0, 10)
  assert(isIsoDateString(date), `Invalid ${ctx} (expected JST datetime)`)
  return date
}

async function tryReadFile(filePath) {
  try {
    return await readFile(filePath, "utf8")
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return null
    throw error
  }
}

async function fetchJsonWithRetry(url, { retries = 2 } = {}) {
  let lastError = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json",
        },
      })
      if (!response.ok) {
        const body = await response.text().catch(() => "")
        const error = new Error(`HTTP ${response.status}`)
        error.status = response.status
        error.body = body
        throw error
      }
      return await response.json()
    } catch (error) {
      lastError = error
      const delayMs = 250 * Math.pow(2, attempt)
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastError
}

function normalizePredictSources(value, ctx) {
  if (value == null) return null
  assert(isPlainObject(value), `Invalid ${ctx} (expected object)`)

  const sources = {}

  if ("weathernews" in value) {
    assert(
      isPlainObject(value.weathernews),
      `Invalid ${ctx}.weathernews (expected object)`,
    )
    sources.weathernews = value.weathernews
  }

  if ("jmc" in value) {
    assert(isPlainObject(value.jmc), `Invalid ${ctx}.jmc (expected object)`)
    sources.jmc = value.jmc
  }

  return Object.keys(sources).length > 0 ? sources : null
}

function findSpotJmcSource(spot) {
  const sources = Array.isArray(spot.sources) ? spot.sources : []
  for (const source of sources) {
    if (!isPlainObject(source)) continue
    if (source.label !== "jmc") continue
    return source
  }
  return null
}

function buildJmcPrefectureApiUrl(prefectureId) {
  const areaCode = pad2(prefectureId)
  return `https://other-api-prod.n-kishou.co.jp/list-jr-points?type=sakura&filter_mode=forecast&area_mode=pref&area_code=${areaCode}&sort_code=0`
}

async function fetchJmcPrefectureForecast(prefectureId) {
  const apiUrl = buildJmcPrefectureApiUrl(prefectureId)
  const json = await fetchJsonWithRetry(apiUrl)

  assert(isPlainObject(json), `Invalid JSON root for ${apiUrl}`)
  assert(isPlainObject(json.result_list), `Missing result_list for ${apiUrl}`)

  const result = json.result_list
  const forecastedAt = isoDateFromJstDateTime(result.update_datetime, `result_list.update_datetime for ${apiUrl}`)

  assert(Array.isArray(result.jr_data), `Missing result_list.jr_data for ${apiUrl}`)
  const pointsByCode = new Map()
  const pointsByName = new Map()

  for (const row of result.jr_data) {
    assert(isPlainObject(row), `Invalid jr_data row for ${apiUrl}`)
    assert(isNonEmptyString(row.code), `Invalid jr_data.code for ${apiUrl}`)
    assert(isNonEmptyString(row.name), `Invalid jr_data.name for ${apiUrl}`)

    if (pointsByCode.has(row.code)) {
      throw new Error(`Duplicate jr_data.code "${row.code}" for ${apiUrl}`)
    }

    const bloomDate = row.bloom_forecast_datetime
      ? isoDateFromJstDateTime(row.bloom_forecast_datetime, `bloom_forecast_datetime for ${apiUrl} (${row.code})`)
      : null
    const fullDate = row.full_forecast_datetime
      ? isoDateFromJstDateTime(row.full_forecast_datetime, `full_forecast_datetime for ${apiUrl} (${row.code})`)
      : null

    const point = {
      code: row.code,
      name_ja: row.name,
      bloomDate,
      fullDate,
    }
    pointsByCode.set(row.code, point)

    const list = pointsByName.get(row.name) ?? []
    list.push(point)
    pointsByName.set(row.name, list)
  }

  return { apiUrl, forecastedAt, pointsByCode, pointsByName }
}

function buildJmcSpotPrediction({ forecastedAt, point }) {
  const prediction = {
    forecasted_at: forecastedAt,
    ...(point.bloomDate ? { first_bloom_date: point.bloomDate } : {}),
    ...(point.fullDate ? { full_bloom_date: point.fullDate } : {}),
  }

  assert(
    Object.values(prediction).some((v) => isNonEmptyString(v)),
    "JMC prediction object is empty",
  )

  return prediction
}

async function buildPrefecturePredictFile({ fileName, raw, existingRaw }) {
  const parsed = parseYaml(raw)
  assert(isPlainObject(parsed), `Invalid YAML root object in ${fileName}`)
  assert(isPlainObject(parsed.prefecture), `Missing \"prefecture\" in ${fileName}`)
  assert(Array.isArray(parsed.spots), `Missing \"spots\" array in ${fileName}`)

  const prefecture = parsed.prefecture
  assert(Number.isInteger(prefecture.id), `Invalid prefecture.id in ${fileName}`)
  assert(isNonEmptyString(prefecture.name_ja), `Invalid prefecture.name_ja in ${fileName}`)

  const existingPredictBySpotId = new Map()
  if (existingRaw) {
    const existingParsed = parseYaml(existingRaw)
    assert(isPlainObject(existingParsed), `Invalid YAML root object in spots_predict/${fileName}`)
    assert(Array.isArray(existingParsed.spots), `Missing \"spots\" array in spots_predict/${fileName}`)
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

  const spotRows = parsed.spots.map((spot) => {
    assert(isPlainObject(spot), `Invalid spot entry in ${fileName}`)
    assert(isNonEmptyString(spot.id), `Invalid spot.id in ${fileName}`)

    const jmcSource = findSpotJmcSource(spot)
    const jmcCode = jmcSource && isNonEmptyString(jmcSource.code) ? jmcSource.code : null
    const jmcName =
      jmcSource && isNonEmptyString(jmcSource.name)
        ? jmcSource.name.trim()
        : isNonEmptyString(spot.name_ja)
          ? spot.name_ja.trim()
          : null

    return { id: spot.id, jmcCode, jmcName, hasJmcSource: !!jmcSource }
  })

  const spotIdsWithJmcSource = spotRows.filter((s) => s.hasJmcSource)
  const prefectureNeedsFetch = spotIdsWithJmcSource.length > 0

  let prefectureForecast = null
  let hadFailure = false

  if (prefectureNeedsFetch) {
    try {
      prefectureForecast = await fetchJmcPrefectureForecast(prefecture.id)
    } catch (error) {
      const status = error && typeof error === "object" ? error.status : undefined
      if (prefecture.id === 47 && status === 400) {
        // Okinawa is currently not supported by JMC API (observed 400). Treat as empty.
        prefectureForecast = null
      } else {
        hadFailure = true
        console.warn(
          `[warn] ${fileName} failed to fetch JMC prefecture forecast (${error instanceof Error ? error.message : String(error)})`,
        )
      }
    }
  }

  const jmcPredictionBySpotId = new Map()
  if (prefectureForecast) {
    for (const row of spotIdsWithJmcSource) {
      let point = null

      if (row.jmcCode) {
        point = prefectureForecast.pointsByCode.get(row.jmcCode) ?? null
        assert(
          point,
          `Missing JMC point code \"${row.jmcCode}\" for ${fileName} (${row.id})`,
        )
      } else {
        assert(row.jmcName, `Missing JMC name for ${fileName} (${row.id})`)
        const candidates = prefectureForecast.pointsByName.get(row.jmcName) ?? []
        assert(
          candidates.length === 1,
          `Expected 1 JMC point named \"${row.jmcName}\", got ${candidates.length} (${fileName} ${row.id})`,
        )
        point = candidates[0]
      }

      const prediction = buildJmcSpotPrediction({
        forecastedAt: prefectureForecast.forecastedAt,
        point,
      })
      jmcPredictionBySpotId.set(row.id, prediction)
    }
  }

  const predictSpots = spotRows.map((row) => {
    const existing = existingPredictBySpotId.get(row.id) ?? null
    const merged = existing ? { ...existing } : {}

    if (!hadFailure) {
      if (jmcPredictionBySpotId.has(row.id)) {
        merged.jmc = jmcPredictionBySpotId.get(row.id)
      } else {
        delete merged.jmc
      }
    }

    const predict = {}
    if (merged.weathernews) predict.weathernews = merged.weathernews
    if (merged.jmc) predict.jmc = merged.jmc

    return Object.keys(predict).length > 0 ? { id: row.id, predict } : { id: row.id }
  })

  return {
    file: {
      prefecture: {
        id: prefecture.id,
        name_ja: prefecture.name_ja,
        ...(isNonEmptyString(prefecture.name_en) ? { name_en: prefecture.name_en } : {}),
      },
      spots: predictSpots,
    },
    hadFailure,
    updatedSpotCount: jmcPredictionBySpotId.size,
  }
}

async function main() {
  const spotsDir = path.join(process.cwd(), "src", "data", "spots")
  const outputDir = path.join(process.cwd(), "src", "data", "spots_predict")
  const existingDir = outputDir

  const fileNames = (await readdir(spotsDir)).filter((f) => f.endsWith(".yml")).sort()
  assert(fileNames.length === 47, `Expected 47 spots yml files, got ${fileNames.length}`)

  await mkdir(outputDir, { recursive: true })

  let prefectureCount = 0
  let spotCount = 0
  let updatedSpotCount = 0
  let failureCount = 0

  for (const fileName of fileNames) {
    const filePath = path.join(spotsDir, fileName)
    const raw = await readFile(filePath, "utf8")

    const existingRaw = await tryReadFile(path.join(existingDir, fileName))
    const predictFile = await buildPrefecturePredictFile({ fileName, raw, existingRaw })

    const outPath = path.join(outputDir, fileName)
    const yaml = stringifyYaml(predictFile.file, { indent: 2 })

    if (existingRaw !== yaml) {
      await writeFile(outPath, yaml)
      console.log(`Updated ${path.relative(process.cwd(), outPath)}`)
    }

    prefectureCount++
    spotCount += predictFile.file.spots.length
    updatedSpotCount += predictFile.updatedSpotCount
    if (predictFile.hadFailure) failureCount++
  }

  console.log(
    `Done: ${prefectureCount} prefectures, ${spotCount} spots, updated ${updatedSpotCount} JMC predictions`,
  )

  if (failureCount > 0) {
    console.warn(`[warn] ${failureCount} prefectures had JMC fetch failures; keeping existing predict.jmc for those prefectures`)
    process.exitCode = 1
  }
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
