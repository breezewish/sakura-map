import { describe, expect, it } from "vitest"

import type { SakuraSpot } from "@/data/sakuraSpotSchema"
import {
  getMarkerRadiusFromTrees,
  getSpotMarkerColor,
  OTHER_MARKER_COLOR,
  SAKURA100_MARKER_COLOR,
  WEATHERNEWS_TOP10_MARKER_COLOR,
} from "@/lib/spotMarker"

describe("getMarkerRadiusFromTrees", () => {
  it("returns smallest radius for unknown trees", () => {
    expect(getMarkerRadiusFromTrees(undefined)).toBe(4)
  })

  it("categorizes by tree count thresholds", () => {
    expect(getMarkerRadiusFromTrees(1)).toBe(4)
    expect(getMarkerRadiusFromTrees(499)).toBe(4)
    expect(getMarkerRadiusFromTrees(500)).toBe(6)
    expect(getMarkerRadiusFromTrees(1999)).toBe(6)
    expect(getMarkerRadiusFromTrees(2000)).toBe(8)
  })
})

function makeSpot(collections: SakuraSpot["collections"]): SakuraSpot {
  return {
    id: "spot",
    name_ja: "spot",
    geo: { lat: 0, lng: 0 },
    collections,
    prefecture: { id: 13, name_ja: "東京都" },
  }
}

describe("getSpotMarkerColor", () => {
  it("uses default color for non special spots", () => {
    expect(getSpotMarkerColor(makeSpot(undefined))).toBe(OTHER_MARKER_COLOR)
  })

  it("uses Weathernews Top10 color", () => {
    expect(getSpotMarkerColor(makeSpot(["weathernews_top10"]))).toBe(
      WEATHERNEWS_TOP10_MARKER_COLOR,
    )
  })

  it("prefers sakura100 color over Weathernews Top10", () => {
    expect(getSpotMarkerColor(makeSpot(["weathernews_top10", "sakura100"]))).toBe(
      SAKURA100_MARKER_COLOR,
    )
  })
})
