import { describe, expect, it } from "vitest"

import { filterSakuraSpots } from "@/lib/sakuraSpotFilters"
import type { SakuraSpot } from "@/data/sakuraSpotSchema"

function makeSpot(
  id: string,
  prefectureId: number,
  collections: SakuraSpot["collections"] = undefined,
): SakuraSpot {
  return {
    id,
    name_ja: id,
    geo: { lat: 0, lng: 0 },
    collections,
    prefecture: { id: prefectureId, name_ja: `P${prefectureId}` },
  }
}

describe("filterSakuraSpots", () => {
  const spots = [
    makeSpot("a", 13, ["sakura100"]),
    makeSpot("b", 13, undefined),
    makeSpot("c", 26, ["sakura100"]),
    makeSpot("d", 26, ["navitime"]),
  ]

  it("returns original array when no filters", () => {
    expect(filterSakuraSpots(spots, { prefectureId: null, collection: null })).toBe(
      spots,
    )
  })

  it("filters by prefecture", () => {
    const filtered = filterSakuraSpots(spots, { prefectureId: 13, collection: null })
    expect(filtered.map((s) => s.id)).toEqual(["a", "b"])
  })

  it("filters by collection", () => {
    const filtered = filterSakuraSpots(spots, {
      prefectureId: null,
      collection: "sakura100",
    })
    expect(filtered.map((s) => s.id)).toEqual(["a", "c"])
  })

  it("filters by prefecture + collection", () => {
    const filtered = filterSakuraSpots(spots, {
      prefectureId: 26,
      collection: "navitime",
    })
    expect(filtered.map((s) => s.id)).toEqual(["d"])
  })
})

