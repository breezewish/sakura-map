import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { parse as parseYaml } from "yaml"

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function isPlainObject(value) {
  return typeof value === "object" && value != null && !Array.isArray(value)
}

function getIndentWidth(line) {
  const m = line.match(/^\s*/)
  return m ? m[0].length : 0
}

const legacyKeys = [
  "forecasted_at",
  "first_bloom_date",
  "full_bloom_date",
  "fubuki_date",
]

function migratePredictBlocks(raw, fileName) {
  const lines = raw.split("\n")
  const out = []
  let changed = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(/^(\s*)predict:\s*$/)
    if (!m) {
      out.push(line)
      continue
    }

    const baseIndent = m[1].length
    out.push(line)

    const nextLine = lines[i + 1]
    assert(
      typeof nextLine === "string",
      `Unexpected EOF after "predict:" in ${fileName}`,
    )

    const weathernewsLine = `${" ".repeat(baseIndent + 2)}weathernews:`
    if (nextLine === weathernewsLine) continue

    const legacyKeyRe = new RegExp(
      `^\\s{${baseIndent + 2}}(${legacyKeys.join("|")}):`,
    )
    assert(
      legacyKeyRe.test(nextLine),
      `Unexpected predict format in ${fileName} near line ${i + 2}`,
    )

    out.push(weathernewsLine)
    changed = true

    i += 1
    for (; i < lines.length; i++) {
      const inner = lines[i]
      const trimmed = inner.trim()
      if (trimmed.length > 0 && getIndentWidth(inner) <= baseIndent) {
        i -= 1
        break
      }
      out.push(`  ${inner}`)
    }
  }

  return { changed, raw: out.join("\n") }
}

function validatePredictFile(raw, fileName) {
  const parsed = parseYaml(raw)
  assert(isPlainObject(parsed), `Invalid YAML root object in ${fileName}`)
  assert(Array.isArray(parsed.spots), `Missing "spots" array in ${fileName}`)

  for (const spot of parsed.spots) {
    assert(isPlainObject(spot), `Invalid spot entry in ${fileName}`)
    if (!("predict" in spot)) continue
    if (spot.predict == null) continue

    assert(
      isPlainObject(spot.predict),
      `Invalid spot.predict in ${fileName} (${spot.id ?? "<unknown>"})`,
    )
    assert(
      isPlainObject(spot.predict.weathernews),
      `Missing spot.predict.weathernews in ${fileName} (${spot.id ?? "<unknown>"})`,
    )

    for (const key of legacyKeys) {
      assert(
        !(key in spot.predict),
        `Legacy key "predict.${key}" still exists in ${fileName} (${spot.id ?? "<unknown>"})`,
      )
    }
  }
}

async function main() {
  const dir = path.join(process.cwd(), "src", "data", "spots_predict")
  const fileNames = (await readdir(dir)).filter((f) => f.endsWith(".yml")).sort()
  assert(fileNames.length === 47, `Expected 47 prefecture files, got ${fileNames.length}`)

  let changedFiles = 0

  for (const fileName of fileNames) {
    const filePath = path.join(dir, fileName)
    const raw = await readFile(filePath, "utf8")
    const migrated = migratePredictBlocks(raw, fileName)
    if (migrated.changed) {
      await writeFile(filePath, migrated.raw, "utf8")
      changedFiles += 1
    }

    const verifyRaw = migrated.changed ? migrated.raw : raw
    validatePredictFile(verifyRaw, fileName)
  }

  console.log(`Migrated ${changedFiles} files under src/data/spots_predict/`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}

