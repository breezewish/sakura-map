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

function isoDateFromJstDateTime(value, ctx) {
  assert(isNonEmptyString(value), `Invalid ${ctx} (expected non-empty string)`)
  // Example: 2026-02-26T00:00:00+09:00
  const date = value.slice(0, 10)
  assert(isIsoDateString(date), `Invalid ${ctx} (expected JST datetime)`)
  return date
}

export function parseJmcPrefectureForecastJson(json, ctx = "JMC") {
  assert(isPlainObject(json), `Invalid ${ctx} JSON root (expected object)`)
  assert(isPlainObject(json.result_list), `Missing ${ctx}.result_list`)

  const result = json.result_list

  const forecasted_at = isoDateFromJstDateTime(
    result.update_datetime,
    `${ctx}.result_list.update_datetime`,
  )

  assert(Array.isArray(result.jr_data), `Missing ${ctx}.result_list.jr_data`)

  const points = result.jr_data.map((row) => {
    assert(isPlainObject(row), `Invalid ${ctx}.result_list.jr_data row`)
    assert(isNonEmptyString(row.code), `Invalid ${ctx}.jr_data.code`)
    assert(isNonEmptyString(row.name), `Invalid ${ctx}.jr_data.name`)

    const first_bloom_date = row.bloom_forecast_datetime
      ? isoDateFromJstDateTime(
          row.bloom_forecast_datetime,
          `${ctx}.jr_data.bloom_forecast_datetime (${row.code})`,
        )
      : null
    const full_bloom_date = row.full_forecast_datetime
      ? isoDateFromJstDateTime(
          row.full_forecast_datetime,
          `${ctx}.jr_data.full_forecast_datetime (${row.code})`,
        )
      : null

    return { code: row.code, name_ja: row.name, first_bloom_date, full_bloom_date }
  })

  return { forecasted_at, points }
}

export function findJmcPointForSpot({ points, code, name }, ctx = "JMC") {
  assert(Array.isArray(points), `Invalid ${ctx} points (expected array)`)

  if (isNonEmptyString(code)) {
    const match = points.find((p) => p.code === code) ?? null
    assert(match, `Missing ${ctx} point code "${code}"`)
    return match
  }

  assert(isNonEmptyString(name), `Missing ${ctx} point name`)
  const candidates = points.filter((p) => p.name_ja === name)
  assert(
    candidates.length === 1,
    `Expected 1 ${ctx} point named "${name}", got ${candidates.length}`,
  )
  return candidates[0]
}
