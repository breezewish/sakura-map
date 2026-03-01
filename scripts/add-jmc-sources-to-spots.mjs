import { readFile, readdir, writeFile } from "node:fs/promises"
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

function normalizeName(value) {
  if (!isNonEmptyString(value)) return ""
  return value
    .replace(/\s+/g, "")
    .replace(/[・･]/g, "")
    .replace(/[“”"'’]/g, "")
    .replace(/[()（）[\]【】]/g, "")
    .replace(/[。、，．・]/g, "")
    .replace(/ヶ/g, "ケ")
    .trim()
}

function haversineKm(aLat, aLon, bLat, bLon) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const R = 6371
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)

  const sin1 = Math.sin(dLat / 2)
  const sin2 = Math.sin(dLon / 2)
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
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

async function fetchJmcPrefecturePoints(prefectureId) {
  const apiUrl = jmcPrefectureApiUrl(prefectureId)
  const json = await fetchJsonWithRetry(apiUrl)
  assert(isPlainObject(json), `Invalid JSON root for ${apiUrl}`)
  assert(isPlainObject(json.result_list), `Missing result_list for ${apiUrl}`)
  assert(Array.isArray(json.result_list.jr_data), `Missing result_list.jr_data for ${apiUrl}`)
  return json.result_list.jr_data.map((row) => {
    assert(isPlainObject(row), `Invalid jr_data row for ${apiUrl}`)
    assert(isNonEmptyString(row.code), `Invalid jr_data.code for ${apiUrl}`)
    assert(isNonEmptyString(row.name), `Invalid jr_data.name for ${apiUrl}`)
    assert(typeof row.lat === "number" && typeof row.lon === "number", `Missing jr_data lat/lon for ${apiUrl} (${row.code})`)
    return {
      code: row.code,
      name_ja: row.name,
      name_norm: normalizeName(row.name),
      lat: row.lat,
      lon: row.lon,
    }
  })
}

function upsertJmcSource({ spot, prefecturePageUrl, match }) {
  const sources = Array.isArray(spot.sources) ? spot.sources : []

  const existing = sources.find((s) => isPlainObject(s) && s.label === "jmc") ?? null
  const desired = {
    label: "jmc",
    url: prefecturePageUrl,
    code: match.code,
    ...(match.name_ja !== spot.name_ja ? { name: match.name_ja } : {}),
  }

  if (!existing) {
    spot.sources = [...sources, desired]
    return true
  }

  let changed = false
  for (const [key, value] of Object.entries(desired)) {
    if (existing[key] !== value) {
      existing[key] = value
      changed = true
    }
  }

  // Keep any extra fields on existing source (e.g. manually added notes).
  return changed
}

function findUniqueMatch({ spot, jmcPoints, maxDistanceKm }) {
  const spotNameNorm = normalizeName(spot.name_ja)
  if (!spotNameNorm) return null

  const candidates = jmcPoints.filter((p) => {
    return p.name_norm.includes(spotNameNorm) || spotNameNorm.includes(p.name_norm)
  })

  if (candidates.length === 0) return null
  if (candidates.length === 1) {
    const candidate = candidates[0]
    const distanceKm = haversineKm(
      spot.geo.lat,
      spot.geo.lng,
      candidate.lat,
      candidate.lon,
    )
    if (distanceKm > maxDistanceKm) return null
    return { type: "unique", point: candidate, distanceKm }
  }

  // Ambiguous: try to disambiguate by species keywords embedded in JMC name.
  const species = Array.isArray(spot.species_ja) ? spot.species_ja : []
  const bySpecies = candidates.filter((c) =>
    species.some((s) => isNonEmptyString(s) && c.name_ja.includes(s)),
  )
  if (bySpecies.length === 1) {
    const candidate = bySpecies[0]
    const distanceKm = haversineKm(
      spot.geo.lat,
      spot.geo.lng,
      candidate.lat,
      candidate.lon,
    )
    if (distanceKm > maxDistanceKm) return null
    return { type: "species", point: candidate, distanceKm }
  }

  return { type: "ambiguous", candidates }
}

async function main() {
  const spotsDir = path.join(process.cwd(), "src", "data", "spots")
  const fileNames = (await readdir(spotsDir)).filter((f) => f.endsWith(".yml")).sort()
  assert(fileNames.length === 47, `Expected 47 spots yml files, got ${fileNames.length}`)

  const maxDistanceKm = 10

  let changedFileCount = 0
  let changedSpotCount = 0
  let matchedSpotCount = 0
  let ambiguousSpotCount = 0

  for (const fileName of fileNames) {
    const filePath = path.join(spotsDir, fileName)
    const raw = await readFile(filePath, "utf8")
    const parsed = parseYaml(raw)

    assert(isPlainObject(parsed), `Invalid YAML root object in ${fileName}`)
    assert(isPlainObject(parsed.prefecture), `Missing "prefecture" in ${fileName}`)
    assert(Number.isInteger(parsed.prefecture.id), `Invalid prefecture.id in ${fileName}`)
    assert(Array.isArray(parsed.spots), `Missing "spots" array in ${fileName}`)

    const prefectureId = parsed.prefecture.id
    const prefecturePageUrl = jmcPrefecturePageUrl(prefectureId)

    let jmcPoints = []
    try {
      jmcPoints = await fetchJmcPrefecturePoints(prefectureId)
    } catch (error) {
      const status = error && typeof error === "object" ? error.status : undefined
      if (prefectureId === 47 && status === 400) {
        // Okinawa is currently not supported by JMC API (observed 400). Keep empty.
        jmcPoints = []
      } else {
        throw error
      }
    }

    let fileChanged = false

    for (const spot of parsed.spots) {
      assert(isPlainObject(spot), `Invalid spot entry in ${fileName}`)
      if (!isNonEmptyString(spot.name_ja)) continue
      if (!isPlainObject(spot.geo)) continue

      const match = findUniqueMatch({ spot, jmcPoints, maxDistanceKm })
      if (!match) continue

      if (match.type === "ambiguous") {
        ambiguousSpotCount++
        continue
      }

      matchedSpotCount++
      const didChange = upsertJmcSource({
        spot,
        prefecturePageUrl,
        match: match.point,
      })
      if (didChange) {
        fileChanged = true
        changedSpotCount++
      }
    }

    if (!fileChanged) continue

    const out = stringifyYaml(parsed, { indent: 2 })
    assert(out !== raw, `Expected ${fileName} to change, but output is identical`)
    await writeFile(filePath, out)
    changedFileCount++
    console.log(`Updated ${path.relative(process.cwd(), filePath)}`)
  }

  console.log(
    `Done: matched=${matchedSpotCount}, ambiguous=${ambiguousSpotCount}, changed_spots=${changedSpotCount}, changed_files=${changedFileCount}`,
  )
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
