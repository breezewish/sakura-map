import { describe, expect, it } from "vitest"

import {
  findJmcPointForSpot,
  parseJmcPrefectureForecastJson,
} from "./jmcPrefectureForecastParser.mjs"

describe("parseJmcPrefectureForecastJson", () => {
  it("parses forecasted_at and spot dates from JMC API json", () => {
    const json = {
      result_list: {
        update_datetime: "2026-02-26T00:00:00+09:00",
        jr_data: [
          {
            code: "01370053",
            name: "美唄市東明公園",
            bloom_forecast_datetime: "2026-05-02T00:00:00+09:00",
            full_forecast_datetime: "2026-05-07T00:00:00+09:00",
          },
        ],
      },
    }

    expect(parseJmcPrefectureForecastJson(json, "fixture")).toEqual({
      forecasted_at: "2026-02-26",
      points: [
        {
          code: "01370053",
          name_ja: "美唄市東明公園",
          first_bloom_date: "2026-05-02",
          full_bloom_date: "2026-05-07",
        },
      ],
    })
  })

  it("allows missing bloom/full dates", () => {
    const json = {
      result_list: {
        update_datetime: "2026-02-26T00:00:00+09:00",
        jr_data: [
          {
            code: "01370053",
            name: "美唄市東明公園",
          },
        ],
      },
    }

    expect(parseJmcPrefectureForecastJson(json, "fixture")).toEqual({
      forecasted_at: "2026-02-26",
      points: [
        {
          code: "01370053",
          name_ja: "美唄市東明公園",
          first_bloom_date: null,
          full_bloom_date: null,
        },
      ],
    })
  })
})

describe("findJmcPointForSpot", () => {
  it("finds by code", () => {
    const points = [
      {
        code: "01370053",
        name_ja: "美唄市東明公園",
        first_bloom_date: "2026-05-02",
        full_bloom_date: "2026-05-07",
      },
    ]

    expect(findJmcPointForSpot({ points, code: "01370053", name: null }, "fixture"))
      .toEqual(points[0])
  })

  it("finds by exact name when unique", () => {
    const points = [
      {
        code: "01370053",
        name_ja: "美唄市東明公園",
        first_bloom_date: "2026-05-02",
        full_bloom_date: "2026-05-07",
      },
    ]

    expect(findJmcPointForSpot({ points, code: null, name: "美唄市東明公園" }, "fixture"))
      .toEqual(points[0])
  })

  it("throws when name is ambiguous", () => {
    const points = [
      {
        code: "a",
        name_ja: "同名",
        first_bloom_date: null,
        full_bloom_date: null,
      },
      {
        code: "b",
        name_ja: "同名",
        first_bloom_date: null,
        full_bloom_date: null,
      },
    ]

    expect(() =>
      findJmcPointForSpot({ points, code: null, name: "同名" }, "fixture"),
    ).toThrow(/Expected 1 fixture point named/)
  })
})
