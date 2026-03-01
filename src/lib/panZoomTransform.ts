export type PanZoomTransform = {
  x: number
  y: number
  k: number
}

export type Point = {
  x: number
  y: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function centerTransformAtPoint(
  point: Point,
  scale: number,
  viewport: { width: number; height: number },
): PanZoomTransform {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`Invalid scale: ${scale}`)
  }

  const centerX = viewport.width / 2
  const centerY = viewport.height / 2
  const x = centerX - point.x * scale
  const y = centerY - point.y * scale
  return { x, y, k: scale }
}

export function zoomTransformAtPoint(
  transform: PanZoomTransform,
  nextScale: number,
  origin: Point,
  options?: { minScale?: number; maxScale?: number },
): PanZoomTransform {
  const minScale = options?.minScale ?? 1
  const maxScale = options?.maxScale ?? 16

  const k0 = transform.k
  const k1 = clamp(nextScale, minScale, maxScale)

  if (!Number.isFinite(k0) || k0 <= 0) {
    throw new Error(`Invalid transform.k: ${k0}`)
  }

  if (k0 === k1) return transform

  const x1 = origin.x - ((origin.x - transform.x) / k0) * k1
  const y1 = origin.y - ((origin.y - transform.y) / k0) * k1

  return { x: x1, y: y1, k: k1 }
}
