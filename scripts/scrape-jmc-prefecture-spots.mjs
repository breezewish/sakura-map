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

function pad2(value) {
  return String(value).padStart(2, "0")
}

function jmcPrefecturePageUrl(prefectureId) {
  const code = pad2(prefectureId)
  return `https://s.n-kishou.co.jp/w/sp/sakura/sakura_yosou?ba=${code}`
}

function jmcPrefectureApiUrl(prefectureId) {
  const code = pad2(prefectureId)
  return `https://other-api-prod.n-kishou.co.jp/list-jr-points?type=sakura&filter_mode=forecast&area_mode=pref&area_code=${code}&sort_code=0`
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

async function readPrefecturesFromSpotsDir(spotsDir) {
  const fileNames = (await readdir(spotsDir)).filter((f) => f.endsWith(".yml")).sort()
  assert(fileNames.length === 47, `Expected 47 spots yml files, got ${fileNames.length}`)

  const prefectures = []
  for (const fileName of fileNames) {
    const filePath = path.join(spotsDir, fileName)
    const raw = await readFile(filePath, "utf8")
    const parsed = parseYaml(raw)

    assert(isPlainObject(parsed), `Invalid YAML root object in ${fileName}`)
    assert(isPlainObject(parsed.prefecture), `Missing "prefecture" in ${fileName}`)
    assert(Number.isInteger(parsed.prefecture.id), `Invalid prefecture.id in ${fileName}`)
    assert(isNonEmptyString(parsed.prefecture.name_ja), `Invalid prefecture.name_ja in ${fileName}`)

    prefectures.push({
      id: parsed.prefecture.id,
      name_ja: parsed.prefecture.name_ja,
      ...(isNonEmptyString(parsed.prefecture.name_en)
        ? { name_en: parsed.prefecture.name_en }
        : {}),
    })
  }

  prefectures.sort((a, b) => a.id - b.id)
  return prefectures
}

async function buildJmcPrefectureSpotsIndex({ prefectures }) {
  const prefectureEntries = []

  for (const prefecture of prefectures) {
    const apiUrl = jmcPrefectureApiUrl(prefecture.id)
    const pageUrl = jmcPrefecturePageUrl(prefecture.id)

    try {
      const json = await fetchJsonWithRetry(apiUrl)
      assert(isPlainObject(json), `Invalid JSON root for ${apiUrl}`)
      assert(isPlainObject(json.result_list), `Missing result_list for ${apiUrl}`)

      const result = json.result_list
      assert(isNonEmptyString(result.area), `Missing result_list.area for ${apiUrl}`)
      assert(
        isNonEmptyString(result.update_datetime),
        `Missing result_list.update_datetime for ${apiUrl}`,
      )
      assert(Array.isArray(result.jr_data), `Missing result_list.jr_data for ${apiUrl}`)

      const seenCodes = new Set()
      const spots = result.jr_data.map((row) => {
        assert(isPlainObject(row), `Invalid jr_data row for ${apiUrl}`)
        assert(isNonEmptyString(row.code), `Invalid jr_data.code for ${apiUrl}`)
        assert(isNonEmptyString(row.name), `Invalid jr_data.name for ${apiUrl}`)
        assert(!seenCodes.has(row.code), `Duplicate jr_data.code "${row.code}" for ${apiUrl}`)
        seenCodes.add(row.code)

        return {
          code: row.code,
          name_ja: row.name,
        }
      })

      spots.sort((a, b) => a.name_ja.localeCompare(b.name_ja, "ja"))

      prefectureEntries.push({
        id: prefecture.id,
        name_ja: prefecture.name_ja,
        ...(isNonEmptyString(prefecture.name_en) ? { name_en: prefecture.name_en } : {}),
        page_url: pageUrl,
        api_url: apiUrl,
        api_area_name: result.area,
        api_update_datetime: result.update_datetime,
        spots,
      })
    } catch (error) {
      const status = error && typeof error === "object" ? error.status : undefined
      const body = error && typeof error === "object" ? error.body : undefined

      prefectureEntries.push({
        id: prefecture.id,
        name_ja: prefecture.name_ja,
        ...(isNonEmptyString(prefecture.name_en) ? { name_en: prefecture.name_en } : {}),
        page_url: pageUrl,
        api_url: apiUrl,
        error: {
          ...(typeof status === "number" ? { status } : {}),
          ...(isNonEmptyString(body) ? { body } : {}),
          message: error instanceof Error ? error.message : String(error),
        },
        spots: [],
      })
    }
  }

  return {
    source: {
      jmc_region_selector_url:
        "https://s.n-kishou.co.jp/w/sp/sakura/sakura_al?yosou=1",
    },
    prefectures: prefectureEntries,
  }
}

async function main() {
  const spotsDir = path.join(process.cwd(), "src", "data", "spots")
  const outDir = path.join(process.cwd(), "src", "data")
  const outFile = path.join(outDir, "jmc_prefecture_spots.yml")

  const prefectures = await readPrefecturesFromSpotsDir(spotsDir)
  const index = await buildJmcPrefectureSpotsIndex({ prefectures })

  await mkdir(outDir, { recursive: true })
  const yaml = stringifyYaml(index, { indent: 2 })
  await writeFile(outFile, yaml)

  const prefectureCount = index.prefectures.length
  const spotCount = index.prefectures.reduce((sum, p) => sum + p.spots.length, 0)
  const erroredPrefectures = index.prefectures.filter((p) => p.error)
  const errorCount = erroredPrefectures.length

  console.log(
    `Generated ${path.relative(process.cwd(), outFile)} (${prefectureCount} prefectures, ${spotCount} spots, ${errorCount} errors)`,
  )

  if (errorCount === 0) return

  const onlyOkinawaMissing =
    erroredPrefectures.length === 1 &&
    erroredPrefectures[0].id === 47 &&
    erroredPrefectures[0].error?.status === 400

  if (onlyOkinawaMissing) {
    console.warn(
      "[warn] JMC API returned HTTP 400 for prefecture 47 (Okinawa). Keeping empty spots list.",
    )
    return
  }

  process.exitCode = 1
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
