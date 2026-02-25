import { describe, expect, it } from "vitest"

import { pickSpotAtPoint, type ProjectedSpotMarker } from "@/lib/spotHitTest"

describe("pickSpotAtPoint", () => {
  it("returns null when nothing is hit", () => {
    const markers: ProjectedSpotMarker[] = []
    const spot = pickSpotAtPoint(markers, { x: 0, y: 0, k: 1 }, { x: 10, y: 10 })
    expect(spot).toBeNull()
  })

  it("picks marker in screen space after transform", () => {
    const a = { id: "a", name_ja: "A", geo: { lat: 0, lng: 0 }, prefecture: { id: 1, name_ja: "X" } }
    const markers: ProjectedSpotMarker[] = [{ spot: a, x: 10, y: 10, r: 4 }]
    const t = { x: 5, y: -3, k: 2 }

    const picked = pickSpotAtPoint(markers, t, { x: 10 * 2 + 5, y: 10 * 2 - 3 })
    expect(picked?.id).toBe("a")
  })

  it("does not scale hit radius with zoom", () => {
    const a = { id: "a", name_ja: "A", geo: { lat: 0, lng: 0 }, prefecture: { id: 1, name_ja: "X" } }
    const markers: ProjectedSpotMarker[] = [{ spot: a, x: 0, y: 0, r: 4 }]

    const t = { x: 0, y: 0, k: 4 }
    const pickedFar = pickSpotAtPoint(markers, t, { x: 10, y: 0 }, { hitSlop: 0 })
    expect(pickedFar).toBeNull()
  })

  it("returns the closest marker when multiple are hit", () => {
    const a = { id: "a", name_ja: "A", geo: { lat: 0, lng: 0 }, prefecture: { id: 1, name_ja: "X" } }
    const b = { id: "b", name_ja: "B", geo: { lat: 0, lng: 0 }, prefecture: { id: 1, name_ja: "X" } }
    const markers: ProjectedSpotMarker[] = [
      { spot: a, x: 0, y: 0, r: 10 },
      { spot: b, x: 5, y: 0, r: 10 },
    ]

    const picked = pickSpotAtPoint(markers, { x: 0, y: 0, k: 1 }, { x: 4, y: 0 })
    expect(picked?.id).toBe("b")
  })
})

