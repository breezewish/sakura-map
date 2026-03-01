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

function pad2(value) {
  return String(value).padStart(2, "0")
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

function asTsvCell(value) {
  if (value == null) return ""
  return String(value).replaceAll("\t", " ").replaceAll("\n", " ")
}

function buildTsv({ header, rows }) {
  return `${header}\n${rows.map((r) => r.join("\t")).join("\n")}\n`
}

async function main() {
  const rootDir = process.cwd()

  const spotsDir = path.join(rootDir, "src", "data", "spots")
  const fileNames = (await readdir(spotsDir)).filter((f) => f.endsWith(".yml")).sort()
  assert(fileNames.length === 47, `Expected 47 spots yml files, got ${fileNames.length}`)

  const jmcIndexPath = path.join(rootDir, "src", "data", "jmc_prefecture_spots.yml")
  const jmcIndexRaw = await readFile(jmcIndexPath, "utf8")
  const jmcIndex = parseYaml(jmcIndexRaw)
  assert(isPlainObject(jmcIndex), "Invalid JMC index YAML root (expected object)")
  assert(Array.isArray(jmcIndex.prefectures), "Invalid JMC index YAML (missing prefectures)")

  const jmcByPrefectureId = new Map()
  for (const prefecture of jmcIndex.prefectures) {
    assert(isPlainObject(prefecture), "Invalid JMC prefecture entry (expected object)")
    assert(Number.isInteger(prefecture.id), "Invalid JMC prefecture.id")
    assert(isNonEmptyString(prefecture.name_ja), `Invalid JMC prefecture.name_ja (${prefecture.id})`)
    assert(Array.isArray(prefecture.spots), `Invalid JMC prefecture.spots (${prefecture.id})`)
    jmcByPrefectureId.set(prefecture.id, prefecture)
  }

  const outDir = path.join(rootDir, ".codexpotter", "out", "jmc-mapping-lists")
  const outSpotsDir = path.join(outDir, "spots")
  const outJmcDir = path.join(outDir, "jmc")
  await mkdir(outSpotsDir, { recursive: true })
  await mkdir(outJmcDir, { recursive: true })

  const reportRows = []

  for (const fileName of fileNames) {
    const filePath = path.join(spotsDir, fileName)
    const raw = await readFile(filePath, "utf8")
    const parsed = parseYaml(raw)

    assert(isPlainObject(parsed), `Invalid YAML root object in ${fileName}`)
    assert(isPlainObject(parsed.prefecture), `Missing "prefecture" in ${fileName}`)
    assert(Number.isInteger(parsed.prefecture.id), `Invalid prefecture.id in ${fileName}`)
    assert(isNonEmptyString(parsed.prefecture.name_ja), `Invalid prefecture.name_ja in ${fileName}`)
    assert(Array.isArray(parsed.spots), `Missing "spots" array in ${fileName}`)

    const prefectureId = parsed.prefecture.id
    const prefectureNameJa = parsed.prefecture.name_ja
    const prefectureNameEn = isNonEmptyString(parsed.prefecture.name_en)
      ? parsed.prefecture.name_en
      : null

    const jmcPrefecture = jmcByPrefectureId.get(prefectureId) ?? null
    assert(jmcPrefecture, `Missing JMC prefecture entry: ${prefectureId} (${fileName})`)

    const spotsHeaderLines = [
      `# prefecture_id: ${prefectureId}`,
      `# prefecture_name_ja: ${prefectureNameJa}`,
      ...(prefectureNameEn ? [`# prefecture_name_en: ${prefectureNameEn}`] : []),
      `# source: ${path.relative(rootDir, filePath)}`,
      `id\tname_ja\tcity_ja\taddress_ja\tjmc_code\tjmc_name`,
    ].join("\n")

    const usedJmcCodes = new Set()
    const spotRows = parsed.spots.map((spot) => {
      assert(isPlainObject(spot), `Invalid spot entry in ${fileName}`)
      assert(isNonEmptyString(spot.id), `Invalid spot.id in ${fileName}`)

      const nameJa = isNonEmptyString(spot.name_ja) ? spot.name_ja.trim() : ""
      const cityJa =
        isPlainObject(spot.location) && isNonEmptyString(spot.location.city_ja)
          ? spot.location.city_ja.trim()
          : ""
      const addressJa =
        isPlainObject(spot.location) && isNonEmptyString(spot.location.address_ja)
          ? spot.location.address_ja.trim()
          : ""

      const jmcSource = findSpotJmcSource(spot)
      const jmcCode = jmcSource && isNonEmptyString(jmcSource.code) ? jmcSource.code : ""
      const jmcName = jmcSource && isNonEmptyString(jmcSource.name) ? jmcSource.name.trim() : ""

      if (jmcCode) usedJmcCodes.add(jmcCode)

      return [
        asTsvCell(spot.id),
        asTsvCell(nameJa),
        asTsvCell(cityJa),
        asTsvCell(addressJa),
        asTsvCell(jmcCode),
        asTsvCell(jmcName),
      ]
    })

    const spotsOutPath = path.join(outSpotsDir, fileName.replace(/\\.yml$/, ".tsv"))
    await writeFile(
      spotsOutPath,
      buildTsv({ header: spotsHeaderLines, rows: spotRows }),
      "utf8",
    )

    const jmcHeaderLines = [
      `# prefecture_id: ${prefectureId}`,
      `# prefecture_name_ja: ${jmcPrefecture.name_ja}`,
      ...(isNonEmptyString(jmcPrefecture.name_en)
        ? [`# prefecture_name_en: ${jmcPrefecture.name_en}`]
        : []),
      ...(isNonEmptyString(jmcPrefecture.page_url) ? [`# page_url: ${jmcPrefecture.page_url}`] : []),
      ...(isNonEmptyString(jmcPrefecture.api_url) ? [`# api_url: ${jmcPrefecture.api_url}`] : []),
      ...(isNonEmptyString(jmcPrefecture.api_update_datetime)
        ? [`# api_update_datetime: ${jmcPrefecture.api_update_datetime}`]
        : []),
      `code\tname_ja\tmapped_in_spots`,
    ].join("\n")

    const jmcSpots = jmcPrefecture.spots
    const jmcRows = jmcSpots.map((s) => {
      assert(isPlainObject(s), `Invalid JMC spot entry (${prefectureId})`)
      assert(isNonEmptyString(s.code), `Invalid JMC spot.code (${prefectureId})`)
      assert(isNonEmptyString(s.name_ja), `Invalid JMC spot.name_ja (${prefectureId} ${s.code})`)
      return [
        asTsvCell(s.code),
        asTsvCell(s.name_ja),
        usedJmcCodes.has(s.code) ? "yes" : "no",
      ]
    })

    const jmcOutPath = path.join(outJmcDir, fileName.replace(/\\.yml$/, ".tsv"))
    await writeFile(jmcOutPath, buildTsv({ header: jmcHeaderLines, rows: jmcRows }), "utf8")

    const jmcCodes = new Set(jmcSpots.map((s) => s.code))
    const unmappedCodes = jmcSpots.filter((s) => !usedJmcCodes.has(s.code))
    const extraCodes = [...usedJmcCodes].filter((c) => !jmcCodes.has(c))

    reportRows.push({
      prefectureId,
      prefectureNameJa,
      fileName,
      spotsCount: parsed.spots.length,
      spotsWithJmc: parsed.spots.filter((spot) => findSpotJmcSource(spot)).length,
      jmcCount: jmcSpots.length,
      mappedJmcCount: usedJmcCodes.size,
      unmappedCodes,
      extraCodes,
    })
  }

  reportRows.sort((a, b) => a.prefectureId - b.prefectureId)
  const reportLines = ["# JMC 映射核对报告", ""]
  for (const row of reportRows) {
    reportLines.push(`## ${pad2(row.prefectureId)} ${row.prefectureNameJa}`)
    reportLines.push(
      `- spots: ${row.spotsCount}（含 jmc source: ${row.spotsWithJmc}）`,
    )
    reportLines.push(
      `- jmc points: ${row.jmcCount}（已映射 code: ${row.mappedJmcCount}）`,
    )
    if (row.extraCodes.length > 0) {
      reportLines.push(`- ⚠️ spots 中存在 JMC code 不在列表内：${row.extraCodes.join(", ")}`)
    }
    if (row.unmappedCodes.length > 0) {
      reportLines.push("- 未映射的 JMC points（code + name）：")
      for (const s of row.unmappedCodes) {
        reportLines.push(`  - ${s.code}\t${s.name_ja}`)
      }
    }
    reportLines.push("")
  }

  const reportPath = path.join(outDir, "report.md")
  await writeFile(reportPath, `${reportLines.join("\n")}\n`, "utf8")

  console.log(`Wrote ${path.relative(rootDir, outDir)}`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

