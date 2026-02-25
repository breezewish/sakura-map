import { describe, expect, it } from "vitest"

import {
  buildSakuraSpotsData,
  parseSakuraPrefectureFileYaml,
} from "@/data/sakuraSpotsDataset"

describe("parseSakuraPrefectureFileYaml", () => {
  it("parses valid yaml", () => {
    const raw = `
prefecture:
  id: 13
  name_ja: 東京都
spots:
  - id: ueno-park
    name_ja: 上野恩賜公園
    geo:
      lat: 35.7122
      lng: 139.7711
`

    const parsed = parseSakuraPrefectureFileYaml(raw, "tokyo.yml")
    expect(parsed.prefecture.id).toBe(13)
    expect(parsed.spots).toHaveLength(1)
    expect(parsed.spots[0].id).toBe("ueno-park")
  })

  it("throws helpful error for invalid schema", () => {
    const raw = `
spots:
  - id: missing-prefecture
    name_ja: 例
    geo:
      lat: 0
      lng: 0
`

    expect(() => parseSakuraPrefectureFileYaml(raw, "broken.yml")).toThrow(
      /Invalid YAML schema in broken\.yml/,
    )
  })
})

describe("buildSakuraSpotsData", () => {
  it("detects duplicate spot id across files", () => {
    const raw1 = `
prefecture:
  id: 1
  name_ja: 北海道
spots:
  - id: dup
    name_ja: A
    geo:
      lat: 1
      lng: 1
`

    const raw2 = `
prefecture:
  id: 2
  name_ja: 青森県
spots:
  - id: dup
    name_ja: B
    geo:
      lat: 2
      lng: 2
`

    expect(() =>
      buildSakuraSpotsData([
        { filePath: "01.yml", raw: raw1 },
        { filePath: "02.yml", raw: raw2 },
      ]),
    ).toThrow(/Duplicate spot id "dup"/)
  })
})
