import { describe, expect, it } from "vitest"

import type { SakuraSpot } from "@/data/sakuraSpotSchema"
import {
  buildSakuraSpotPredictionsMap,
  mergeSakuraSpotPredictions,
  parseSakuraPrefecturePredictFileYaml,
} from "@/data/sakuraSpotPredictionsDataset"

describe("parseSakuraPrefecturePredictFileYaml", () => {
  it("parses valid yaml", () => {
    const raw = `
prefecture:
  id: 13
  name_ja: 東京都
spots:
  - id: ueno-park
    predict:
      forecasted_at: 2026-02-25
      first_bloom_date: 2026-03-20
      full_bloom_date: 2026-03-27
      fubuki_date: 2026-03-31
`

    const parsed = parseSakuraPrefecturePredictFileYaml(raw, "tokyo.yml")
    expect(parsed.prefecture.id).toBe(13)
    expect(parsed.spots).toHaveLength(1)
    expect(parsed.spots[0].id).toBe("ueno-park")
    expect(parsed.spots[0].predict?.first_bloom_date).toBe("2026-03-20")
  })

  it("throws helpful error for invalid schema", () => {
    const raw = `
prefecture:
  id: 13
  name_ja: 東京都
spots:
  - id: ueno-park
    predict:
      first_bloom_date: 03-20
`

    expect(() => parseSakuraPrefecturePredictFileYaml(raw, "broken.yml")).toThrow(
      /Invalid YAML schema in broken\.yml/,
    )
  })
})

describe("buildSakuraSpotPredictionsMap", () => {
  it("detects duplicate spot id across files", () => {
    const raw1 = `
prefecture:
  id: 1
  name_ja: 北海道
spots:
  - id: dup
    predict:
      forecasted_at: 2026-02-25
`

    const raw2 = `
prefecture:
  id: 2
  name_ja: 青森県
spots:
  - id: dup
    predict:
      forecasted_at: 2026-02-25
`

    expect(() =>
      buildSakuraSpotPredictionsMap([
        { filePath: "01.yml", raw: raw1 },
        { filePath: "02.yml", raw: raw2 },
      ]),
    ).toThrow(/Duplicate spot id "dup"/)
  })
})

describe("mergeSakuraSpotPredictions", () => {
  it("merges predictions into matching spots", () => {
    const spots: SakuraSpot[] = [
      {
        id: "ueno-park",
        name_ja: "上野恩賜公園",
        geo: { lat: 35.7, lng: 139.77 },
        prefecture: { id: 13, name_ja: "東京都" },
      },
      {
        id: "yoyogi-park",
        name_ja: "代々木公園",
        geo: { lat: 35.67, lng: 139.69 },
        prefecture: { id: 13, name_ja: "東京都" },
      },
    ]

    const predictions = buildSakuraSpotPredictionsMap([
      {
        filePath: "13-tokyo.yml",
        raw: `
prefecture:
  id: 13
  name_ja: 東京都
spots:
  - id: ueno-park
    predict:
      forecasted_at: 2026-02-25
      first_bloom_date: 2026-03-20
`,
      },
    ])

    const merged = mergeSakuraSpotPredictions(spots, predictions)
    expect(merged[0].predict?.forecasted_at).toBe("2026-02-25")
    expect(merged[0].predict?.first_bloom_date).toBe("2026-03-20")
    expect(merged[1].predict).toBeUndefined()
  })
})

