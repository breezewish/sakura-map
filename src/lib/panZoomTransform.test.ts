import { describe, expect, it } from "vitest"

import { zoomTransformAtPoint, type PanZoomTransform } from "@/lib/panZoomTransform"

function toContentSpace(point: { x: number; y: number }, t: PanZoomTransform) {
  return { x: (point.x - t.x) / t.k, y: (point.y - t.y) / t.k }
}

function toScreenSpace(point: { x: number; y: number }, t: PanZoomTransform) {
  return { x: point.x * t.k + t.x, y: point.y * t.k + t.y }
}

describe("zoomTransformAtPoint", () => {
  it("keeps the origin pinned after zooming", () => {
    const t0: PanZoomTransform = { x: 50, y: -25, k: 2 }
    const origin = { x: 120, y: 80 }

    const contentPoint = toContentSpace(origin, t0)
    const t1 = zoomTransformAtPoint(t0, 4, origin)

    const originAfter = toScreenSpace(contentPoint, t1)
    expect(originAfter.x).toBeCloseTo(origin.x, 6)
    expect(originAfter.y).toBeCloseTo(origin.y, 6)
  })

  it("clamps scale and returns same transform when unchanged", () => {
    const t0: PanZoomTransform = { x: 0, y: 0, k: 1 }
    const origin = { x: 0, y: 0 }

    const t1 = zoomTransformAtPoint(t0, 0.5, origin, { minScale: 1, maxScale: 8 })
    expect(t1.k).toBe(1)

    const t2 = zoomTransformAtPoint(t0, 1, origin, { minScale: 1, maxScale: 8 })
    expect(t2).toBe(t0)
  })
})

