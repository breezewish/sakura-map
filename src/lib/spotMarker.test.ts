import { describe, expect, it } from "vitest"

import { getMarkerRadiusFromTrees } from "@/lib/spotMarker"

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

