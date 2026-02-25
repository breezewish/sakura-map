import type { SakuraSpot } from "@/data/sakuraSpotSchema"
import type { PanZoomTransform, Point } from "@/lib/panZoomTransform"

export type ProjectedSpotMarker = {
  spot: SakuraSpot
  x: number
  y: number
  r: number
}

export type PickSpotAtPointOptions = {
  /**
   * Extra tolerance radius for hit testing (in screen pixels).
   *
   * Note: The hit radius does NOT scale with zoom `k`, matching the desired
   * behavior where spot markers keep a constant screen size while zooming.
   */
  hitSlop?: number
}

/**
 * Returns the hit spot at the given screen point.
 *
 * - Converts projected marker coordinates into screen space using `transform`
 * - Performs hit testing using screen-pixel radius (r + hitSlop), independent
 *   of zoom scale
 * - If multiple spots are hit, returns the closest one
 */
export function pickSpotAtPoint(
  markers: readonly ProjectedSpotMarker[],
  transform: PanZoomTransform,
  point: Point,
  options?: PickSpotAtPointOptions,
): SakuraSpot | null {
  const hitSlop = options?.hitSlop ?? 2

  let best: SakuraSpot | null = null
  let bestDist2 = Number.POSITIVE_INFINITY

  for (const marker of markers) {
    const cx = marker.x * transform.k + transform.x
    const cy = marker.y * transform.k + transform.y
    const dx = point.x - cx
    const dy = point.y - cy

    const r = marker.r + hitSlop
    const dist2 = dx * dx + dy * dy
    if (dist2 <= r * r && dist2 < bestDist2) {
      best = marker.spot
      bestDist2 = dist2
    }
  }

  return best
}
