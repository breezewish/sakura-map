function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function extractYearFromTitle(html) {
  const match = html.match(/<title>.*?【(\d{4})】.*?<\/title>/)
  if (!match) return null
  const year = Number(match[1])
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null
  return year
}

function parseMonthDay(text) {
  const match = text.match(/(\d{1,2})月(\d{1,2})日/)
  if (!match) return null

  const month = Number(match[1])
  const day = Number(match[2])
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  if (!Number.isInteger(day) || day < 1 || day > 31) return null

  return { month, day }
}

function toIsoDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function extractDtDdText(html, label) {
  const re = new RegExp(
    `<dt[^>]*>\\s*${escapeRegExp(label)}\\s*<\\/dt>\\s*<dd[^>]*>\\s*([^<]+?)\\s*<\\/dd>`,
    "m",
  )
  const match = html.match(re)
  if (!match) return null
  return match[1].trim()
}

function extractKaikaStatusDateText(html) {
  const match = html.match(
    /<p[^>]*class="[^"]*kaikaStatus__date[^"]*"[^>]*>\s*([^<]+?)\s*<\/p>/,
  )
  return match ? match[1].trim() : null
}

export function parseWeathernewsSpotForecastHtml(html) {
  if (typeof html !== "string" || html.length === 0) return null

  const year = extractYearFromTitle(html)
  if (!year) return null

  const result = {}

  const forecastedText = extractKaikaStatusDateText(html)
  if (forecastedText) {
    const md = parseMonthDay(forecastedText)
    if (md) result.forecasted_at = toIsoDate(year, md.month, md.day)
  }

  const firstBloomText = extractDtDdText(html, "開花予想日")
  if (firstBloomText) {
    const md = parseMonthDay(firstBloomText)
    if (md) result.first_bloom_date = toIsoDate(year, md.month, md.day)
  }

  const fullBloomText = extractDtDdText(html, "満開")
  if (fullBloomText) {
    const md = parseMonthDay(fullBloomText)
    if (md) result.full_bloom_date = toIsoDate(year, md.month, md.day)
  }

  const fubukiText = extractDtDdText(html, "桜吹雪")
  if (fubukiText) {
    const md = parseMonthDay(fubukiText)
    if (md) result.fubuki_date = toIsoDate(year, md.month, md.day)
  }

  if (
    result.first_bloom_date == null &&
    result.full_bloom_date == null &&
    result.fubuki_date == null
  ) {
    return null
  }

  return result
}
