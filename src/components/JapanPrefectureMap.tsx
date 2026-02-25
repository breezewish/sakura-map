import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { geoMercator, geoPath } from "d3-geo"
import { feature } from "topojson-client"
import type { Topology } from "topojson-specification"
import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson"

import { useElementSize } from "@/hooks/useElementSize"
import type { SakuraSpot } from "@/data/sakuraSpotSchema"
import {
  getSpotMarkerRadius,
  isSakura100Spot,
  OTHER_MARKER_COLOR,
  SAKURA100_MARKER_COLOR,
  WEATHERNEWS_TOP10_MARKER_COLOR,
} from "@/lib/spotMarker"
import { zoomTransformAtPoint } from "@/lib/panZoomTransform"
import { pickSpotAtPoint, type ProjectedSpotMarker } from "@/lib/spotHitTest"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { ExternalLink, Minus, Plus, RotateCcw } from "lucide-react"

type PrefectureProperties = GeoJsonProperties & {
  nam?: string
  nam_ja?: string
  id?: number
}

type PrefectureFeatureCollection = FeatureCollection<Geometry, PrefectureProperties>

type LoadState =
  | { status: "loading" }
  | { status: "ready"; geo: PrefectureFeatureCollection }
  | { status: "error"; message: string }

type PrefectureLabel = {
  key: string
  label: string
  x: number
  y: number
}

const MARKER_STROKE_COLOR = "rgba(255,255,255,0.9)"
const SELECTED_RING_COLOR = "rgba(0,0,0,0.4)"
const HOVER_RING_COLOR = "rgba(0,0,0,0.25)"

type ProjectedSpot = ProjectedSpotMarker & {
  markerKind: "sakura100" | "weathernews_top10" | "other"
}

export type JapanPrefectureMapProps = {
  spots?: SakuraSpot[]
  selectedSpot?: SakuraSpot | null
  onSelectedSpotChange?: (spot: SakuraSpot | null) => void
}

export function JapanPrefectureMap({
  spots = [],
  selectedSpot,
  onSelectedSpotChange,
}: JapanPrefectureMapProps) {
  const { ref, size } = useElementSize<HTMLDivElement>()
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" })
  const zoomLayerRef = useRef<SVGGElement | null>(null)
  const markerCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const transformAnimationRafRef = useRef<number | null>(null)
  const transformRef = useRef<{ x: number; y: number; k: number }>({
    x: 0,
    y: 0,
    k: 1,
  })
  const selectedSpotRef = useRef<SakuraSpot | null>(null)
  const projectedSpotsRef = useRef<ProjectedSpot[]>([])
  const prefectureLabelsRef = useRef<PrefectureLabel[]>([])
  const hoveredSpotIdRef = useRef<string | null>(null)
  const sizeRef = useRef({ width: 0, height: 0 })
  const onSelectedSpotChangeRef = useRef<JapanPrefectureMapProps["onSelectedSpotChange"]>(
    onSelectedSpotChange,
  )
  const didPanRef = useRef(false)

  useEffect(() => {
    selectedSpotRef.current = selectedSpot ?? null
  }, [selectedSpot])

  useEffect(() => {
    sizeRef.current = size
  }, [size])

  useEffect(() => {
    onSelectedSpotChangeRef.current = onSelectedSpotChange
  }, [onSelectedSpotChange])

  useEffect(() => {
    const abortController = new AbortController()

    async function load() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}maps/japan.topojson`, {
          signal: abortController.signal,
        })
        if (!response.ok) {
          throw new Error(`Failed to load japan.topojson (${response.status})`)
        }

        const topo = (await response.json()) as Topology
        const object = (topo.objects as Record<string, unknown>)["japan"]
        if (!object) throw new Error(`Missing "objects.japan" in topojson`)

        const geo = feature(topo, object as never) as unknown as PrefectureFeatureCollection
        setLoadState({ status: "ready", geo })
      } catch (error) {
        if (abortController.signal.aborted) return
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    load()

    return () => abortController.abort()
  }, [])

  const projection = useMemo(() => {
    if (loadState.status !== "ready") return null
    if (size.width <= 0 || size.height <= 0) return null
    return geoMercator().fitSize([size.width, size.height], loadState.geo)
  }, [loadState, size.height, size.width])

  const path = useMemo(() => {
    if (!projection) return null
    return geoPath(projection)
  }, [projection])

  const selectedSpotBasePoint = useMemo(() => {
    if (!projection) return null
    if (!selectedSpot) return null

    const point = projection([selectedSpot.geo.lng, selectedSpot.geo.lat])
    if (!point) return null

    const [x, y] = point
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null

    return { x, y }
  }, [projection, selectedSpot])

  const selectedSpotAnchor = useMemo(() => {
    if (!selectedSpotBasePoint) return null

    const t = transformRef.current
    const x = selectedSpotBasePoint.x * t.k + t.x
    const y = selectedSpotBasePoint.y * t.k + t.y
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null

    return { x, y }
  }, [selectedSpotBasePoint])

  const selectedSpotPhotos = selectedSpot?.photos ?? []

  const prefecturePaths = useMemo(() => {
    if (loadState.status !== "ready") return []
    if (!path) return []

    return loadState.geo.features.flatMap((prefecture, index) => {
      const d = path(prefecture) ?? undefined
      if (!d) return []

      const id = prefecture.properties?.id
      const key = String(id ?? `${prefecture.properties?.nam ?? "pref"}-${index}`)

      return [{ key, d }]
    })
  }, [loadState, path])

  const prefectureLabels = useMemo(() => {
    if (loadState.status !== "ready") return []
    if (!path) return []

    return loadState.geo.features.flatMap((prefecture, index) => {
      const label = prefecture.properties?.nam_ja?.trim()
      if (!label) return []

      const [x, y] = path.centroid(prefecture as never)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return []

      const key = String(prefecture.properties?.id ?? index)
      return [{ key, label, x, y }]
    })
  }, [loadState, path])

  const projectedSpots = useMemo((): ProjectedSpot[] => {
    if (!projection) return []

    return spots.flatMap((spot) => {
      const point = projection([spot.geo.lng, spot.geo.lat])
      if (!point) return []

      const [x, y] = point
      if (!Number.isFinite(x) || !Number.isFinite(y)) return []

      return [
        {
          spot,
          x,
          y,
          r: getSpotMarkerRadius(spot),
          markerKind: isSakura100Spot(spot)
            ? "sakura100"
            : spot.collections?.includes("weathernews_top10")
              ? "weathernews_top10"
              : "other",
        },
      ]
    })
  }, [projection, spots])

  const drawMarkers = useCallback(() => {
    const canvas = markerCanvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const { width, height } = sizeRef.current
    if (width <= 0 || height <= 0) return

    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const t = transformRef.current
    const labels = prefectureLabelsRef.current
    const markers = projectedSpotsRef.current

    if (labels.length > 0) {
      ctx.globalAlpha = 0.75
      ctx.font =
        "500 10px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, Noto Sans, sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.lineJoin = "round"
      ctx.lineCap = "round"
      ctx.lineWidth = 3
      ctx.strokeStyle = "rgba(255,255,255,0.9)"
      ctx.fillStyle = "rgba(64,64,64,0.85)"

      for (const item of labels) {
        const x = item.x * t.k + t.x
        const y = item.y * t.k + t.y

        if (x < -80 || x > width + 80 || y < -40 || y > height + 40) continue

        ctx.strokeText(item.label, x, y)
        ctx.fillText(item.label, x, y)
      }
    }

    ctx.globalAlpha = 0.9
    ctx.lineWidth = 1.5
    ctx.strokeStyle = MARKER_STROKE_COLOR

    const drawGroup = (kind: ProjectedSpot["markerKind"], fill: string) => {
      ctx.beginPath()
      for (const marker of markers) {
        if (marker.markerKind !== kind) continue

        const cx = marker.x * t.k + t.x
        const cy = marker.y * t.k + t.y
        const r = marker.r

        if (cx < -r || cx > width + r || cy < -r || cy > height + r) continue

        ctx.moveTo(cx + r, cy)
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
      }

      ctx.fillStyle = fill
      ctx.fill()
      ctx.stroke()
    }

    drawGroup("other", OTHER_MARKER_COLOR)
    drawGroup("weathernews_top10", WEATHERNEWS_TOP10_MARKER_COLOR)
    drawGroup("sakura100", SAKURA100_MARKER_COLOR)

    ctx.globalAlpha = 1
    const selected = selectedSpotRef.current
    const hoveredId = hoveredSpotIdRef.current
    if (hoveredId && selected?.id !== hoveredId) {
      const marker = markers.find((m) => m.spot.id === hoveredId)
      if (marker) {
        const cx = marker.x * t.k + t.x
        const cy = marker.y * t.k + t.y
        const r = marker.r + 3

        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = HOVER_RING_COLOR
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
    if (selected) {
      const marker = markers.find((m) => m.spot.id === selected.id)
      if (marker) {
        const cx = marker.x * t.k + t.x
        const cy = marker.y * t.k + t.y
        const r = marker.r + 3

        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = SELECTED_RING_COLOR
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
  }, [])

  useEffect(() => {
    projectedSpotsRef.current = projectedSpots
    drawMarkers()
  }, [drawMarkers, projectedSpots])

  useEffect(() => {
    prefectureLabelsRef.current = prefectureLabels
    drawMarkers()
  }, [drawMarkers, prefectureLabels])

  useEffect(() => {
    drawMarkers()
  }, [drawMarkers, selectedSpot])

  useEffect(() => {
    const canvas = markerCanvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const nextWidth = Math.max(1, Math.round(size.width * dpr))
    const nextHeight = Math.max(1, Math.round(size.height * dpr))

    if (canvas.width !== nextWidth) canvas.width = nextWidth
    if (canvas.height !== nextHeight) canvas.height = nextHeight

    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`

    drawMarkers()
  }, [drawMarkers, loadState.status, size.height, size.width])

  const stopTransformAnimation = useCallback(() => {
    if (transformAnimationRafRef.current == null) return
    window.cancelAnimationFrame(transformAnimationRafRef.current)
    transformAnimationRafRef.current = null
  }, [])

  const animateTransform = useCallback(
    (nextTransform: { x: number; y: number; k: number }, options?: { durationMs?: number }) => {
      const layer = zoomLayerRef.current
      if (!layer) return

      stopTransformAnimation()

      const durationMs = Math.max(0, options?.durationMs ?? 180)
      const start = transformRef.current
      const startTime = performance.now()

      const tick = (now: number) => {
        const elapsed = now - startTime
        const t = durationMs === 0 ? 1 : Math.min(1, elapsed / durationMs)
        const eased = 1 - Math.pow(1 - t, 3)

        transformRef.current = {
          x: start.x + (nextTransform.x - start.x) * eased,
          y: start.y + (nextTransform.y - start.y) * eased,
          k: start.k + (nextTransform.k - start.k) * eased,
        }

        const current = transformRef.current
        layer.setAttribute("transform", `translate(${current.x} ${current.y}) scale(${current.k})`)
        drawMarkers()

        if (t >= 1) {
          transformAnimationRafRef.current = null
          return
        }

        transformAnimationRafRef.current = window.requestAnimationFrame(tick)
      }

      transformAnimationRafRef.current = window.requestAnimationFrame(tick)
    },
    [drawMarkers, stopTransformAnimation],
  )

  useEffect(() => {
    const canvas = markerCanvasRef.current
    const layer = zoomLayerRef.current
    if (!canvas || !layer) return

    const applyTransform = () => {
      const t = transformRef.current
      layer.setAttribute("transform", `translate(${t.x} ${t.y}) scale(${t.k})`)
      drawMarkers()
    }

    const scheduleTransform = () => {
      if (rafRef.current != null) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        applyTransform()
      })
    }

    const startInertia = (velocity: { x: number; y: number }) => {
      stopTransformAnimation()

      const minStartSpeed = 0.06
      const maxStartSpeed = 4
      const minStopSpeed = 0.01
      const frictionPerMs = Math.log(2) / 320

      let vx = velocity.x
      let vy = velocity.y

      const speed = Math.hypot(vx, vy)
      if (!Number.isFinite(speed) || speed < minStartSpeed) return

      if (speed > maxStartSpeed) {
        const ratio = maxStartSpeed / speed
        vx *= ratio
        vy *= ratio
      }

      let lastTime = performance.now()

      const tick = (now: number) => {
        const dt = Math.min(64, Math.max(0, now - lastTime))
        lastTime = now

        const current = transformRef.current
        transformRef.current = {
          x: current.x + vx * dt,
          y: current.y + vy * dt,
          k: current.k,
        }

        const decay = Math.exp(-frictionPerMs * dt)
        vx *= decay
        vy *= decay

        applyTransform()

        if (Math.hypot(vx, vy) < minStopSpeed) {
          transformAnimationRafRef.current = null
          return
        }

        transformAnimationRafRef.current = window.requestAnimationFrame(tick)
      }

      transformAnimationRafRef.current = window.requestAnimationFrame(tick)
    }

    let isPointerDown = false
    let activePointerId: number | null = null
    let start = { x: 0, y: 0 }
    let startTransform = { x: 0, y: 0 }
    let panSamples: Array<{ x: number; y: number; time: number }> = []

    const recordPanSample = (time: number) => {
      const current = transformRef.current
      panSamples.push({ x: current.x, y: current.y, time })

      const windowMs = 120
      while (panSamples.length > 2 && time - panSamples[0].time > windowMs) {
        panSamples.shift()
      }
      if (panSamples.length > 8) {
        panSamples.shift()
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      if (!event.isPrimary) return

      stopTransformAnimation()
      isPointerDown = true
      activePointerId = event.pointerId
      start = { x: event.clientX, y: event.clientY }
      startTransform = {
        x: transformRef.current.x,
        y: transformRef.current.y,
      }

      didPanRef.current = false
      panSamples = []
      recordPanSample(performance.now())
      hoveredSpotIdRef.current = null
      canvas.classList.add("cursor-grab")
      canvas.classList.remove("cursor-pointer")
      canvas.setPointerCapture(event.pointerId)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!isPointerDown) {
        const rect = canvas.getBoundingClientRect()
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
        const hovered = pickSpotAtPoint(
          projectedSpotsRef.current,
          transformRef.current,
          point,
          { hitSlop: 6 },
        )
        const hoveredId = hovered?.id ?? null
        if (hoveredSpotIdRef.current !== hoveredId) {
          hoveredSpotIdRef.current = hoveredId
          canvas.classList.toggle("cursor-grab", hoveredId == null)
          canvas.classList.toggle("cursor-pointer", hoveredId != null)
          drawMarkers()
        }
        return
      }

      if (activePointerId !== event.pointerId) return

      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      if (!didPanRef.current) {
        const moved = Math.abs(dx) + Math.abs(dy)
        if (moved < 3) return
        didPanRef.current = true
        if (selectedSpotRef.current) {
          onSelectedSpotChangeRef.current?.(null)
          selectedSpotRef.current = null
        }
      }

      transformRef.current = {
        x: startTransform.x + dx,
        y: startTransform.y + dy,
        k: transformRef.current.k,
      }
      recordPanSample(performance.now())
      scheduleTransform()
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (activePointerId === event.pointerId) {
        isPointerDown = false
        activePointerId = null
      }
      try {
        canvas.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }

      if (!didPanRef.current) {
        const rect = canvas.getBoundingClientRect()
        const point = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        }
        const picked = pickSpotAtPoint(
          projectedSpotsRef.current,
          transformRef.current,
          point,
          { hitSlop: 4 },
        )
        onSelectedSpotChangeRef.current?.(picked)
      } else if (panSamples.length >= 2) {
        const first = panSamples[0]
        const last = panSamples[panSamples.length - 1]
        const dt = last.time - first.time
        if (dt > 0) {
          startInertia({ x: (last.x - first.x) / dt, y: (last.y - first.y) / dt })
        }
      }

      didPanRef.current = false
      panSamples = []
    }

    const handlePointerLeave = () => {
      if (hoveredSpotIdRef.current == null) return
      hoveredSpotIdRef.current = null
      canvas.classList.add("cursor-grab")
      canvas.classList.remove("cursor-pointer")
      drawMarkers()
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      stopTransformAnimation()
      if (selectedSpotRef.current) {
        onSelectedSpotChangeRef.current?.(null)
        selectedSpotRef.current = null
      }

      const rect = canvas.getBoundingClientRect()
      const origin = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }

      const t = transformRef.current
      const wheelDelta =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY

      const scaleBy = Math.exp(-wheelDelta * 0.002)
      transformRef.current = zoomTransformAtPoint(t, t.k * scaleBy, origin)
      scheduleTransform()
    }

    canvas.addEventListener("pointerdown", handlePointerDown)
    canvas.addEventListener("pointermove", handlePointerMove)
    canvas.addEventListener("pointerup", handlePointerUp)
    canvas.addEventListener("pointercancel", handlePointerUp)
    canvas.addEventListener("pointerleave", handlePointerLeave)
    canvas.addEventListener("wheel", handleWheel, { passive: false })

    applyTransform()

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown)
      canvas.removeEventListener("pointermove", handlePointerMove)
      canvas.removeEventListener("pointerup", handlePointerUp)
      canvas.removeEventListener("pointercancel", handlePointerUp)
      canvas.removeEventListener("pointerleave", handlePointerLeave)
      canvas.removeEventListener("wheel", handleWheel)
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      stopTransformAnimation()
    }
  }, [drawMarkers, loadState.status, path, stopTransformAnimation])

  return (
    <div ref={ref} className="relative h-full w-full bg-[#F4F5F7]">
      {loadState.status === "loading" && (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">
          正在加载日本地图…
        </div>
      )}

      {loadState.status === "error" && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-destructive">
          地图加载失败：{loadState.message}
        </div>
      )}

      {loadState.status === "ready" && path && (
        <>
          <svg
            role="img"
            aria-label="Japan prefecture map"
            width={size.width}
            height={size.height}
            className="absolute inset-0 pointer-events-none select-none"
          >
            <g ref={zoomLayerRef}>
              <g>
                {prefecturePaths.map((pref) => (
                  <path
                    key={pref.key}
                    d={pref.d}
                    className="fill-neutral-200 stroke-white/80"
                    strokeWidth={0.8}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            </g>
          </svg>

          <canvas
            ref={markerCanvasRef}
            className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
          />
        </>
      )}

      {selectedSpot && selectedSpotAnchor && (
        <Popover
          open
          onOpenChange={(open) => {
            if (!open) onSelectedSpotChange?.(null)
          }}
        >
          <PopoverAnchor asChild>
            <div
              className="absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2"
              style={{ left: selectedSpotAnchor.x, top: selectedSpotAnchor.y }}
            />
          </PopoverAnchor>

          <PopoverContent
            side="top"
            align="center"
            sideOffset={12}
            className="w-[420px] overflow-hidden rounded-2xl bg-white p-0 shadow-xl"
          >
            <div className="grid">
              {selectedSpotPhotos.length > 0 ? (
                <Carousel
                  opts={{ loop: selectedSpotPhotos.length > 1 }}
                  className="w-full"
                >
                  <CarouselContent className="!ml-0">
                    {selectedSpotPhotos.map((photo, index) => (
                      <CarouselItem key={`${selectedSpot.id}-${index}`} className="!pl-0">
                        <div className="relative aspect-[16/10] w-full bg-muted/20">
                          <img
                            src={photo.url}
                            alt={`${selectedSpot.name_ja} ${index + 1}`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />

                          {photo.credit || photo.source_url ? (
                            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent px-3 py-2 text-[11px] text-white/90">
                              <div className="min-w-0 truncate">
                                {photo.credit ?? "Photo"}
                              </div>
                              {photo.source_url ? (
                                <a
                                  href={photo.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="shrink-0 underline-offset-2 hover:underline"
                                >
                                  来源
                                </a>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>

                  {selectedSpotPhotos.length > 1 ? (
                    <>
                      <CarouselPrevious className="!left-2 !top-1/2 h-8 w-8 !-translate-y-1/2 bg-white/80 hover:bg-white" />
                      <CarouselNext className="!right-2 !top-1/2 h-8 w-8 !-translate-y-1/2 bg-white/80 hover:bg-white" />
                    </>
                  ) : null}
                </Carousel>
              ) : (
                <div className="grid aspect-[16/10] w-full place-items-center bg-muted/20 text-xs text-muted-foreground">
                  暂无照片
                </div>
              )}

              <div className="grid gap-3 p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <div className="text-sm font-semibold leading-tight">
                      {selectedSpot.name_ja}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedSpot.prefecture.name_ja}
                      {selectedSpot.location?.city_ja
                        ? ` · ${selectedSpot.location.city_ja}`
                        : ""}
                    </div>
                  </div>

                  <div className="shrink-0 text-xs text-muted-foreground">
                    {typeof selectedSpot.trees === "number"
                      ? `${new Intl.NumberFormat().format(selectedSpot.trees)} 棵`
                      : "—"}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {selectedSpot.collections?.includes("sakura100") ? (
                    <span className="rounded bg-pink-400/15 px-2 py-0.5 text-[11px] text-pink-700">
                      日本さくら名所100選
                    </span>
                  ) : null}
                  {selectedSpot.collections?.includes("navitime") ? (
                    <span className="rounded bg-blue-400/15 px-2 py-0.5 text-[11px] text-blue-700">
                      NAVITIME
                    </span>
                  ) : null}
                  {selectedSpot.collections?.includes("weathernews") ? (
                    <span className="rounded bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-700">
                      Weathernews
                    </span>
                  ) : null}
                  {!selectedSpot.collections?.length ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedSpot.links?.weathernews ? (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={selectedSpot.links.weathernews}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Weathernews <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  ) : null}

                  {selectedSpot.links?.navitime ? (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={selectedSpot.links.navitime}
                        target="_blank"
                        rel="noreferrer"
                      >
                        NAVITIME <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  ) : null}

                  {selectedSpot.links?.wikipedia ? (
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={selectedSpot.links.wikipedia}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Wikipedia <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      <div className="absolute bottom-2 left-2 rounded-lg bg-white/90 px-3 py-1.5 text-[11px] text-neutral-600 shadow-sm">
        底图：地球地図日本（都道府県境界） · 拖动平移 / 滚轮缩放
      </div>

      <div className="absolute bottom-3 right-3 z-10 grid gap-2 rounded-xl bg-white/90 p-2 shadow-sm">
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="放大"
          onClick={() => {
            if (!zoomLayerRef.current) return

            if (selectedSpotRef.current) {
              onSelectedSpotChangeRef.current?.(null)
              selectedSpotRef.current = null
            }

            const origin = { x: size.width / 2, y: size.height / 2 }
            const t = transformRef.current
            const next = zoomTransformAtPoint(t, t.k * 1.25, origin)
            animateTransform(next, { durationMs: 200 })
          }}
        >
          <Plus />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="缩小"
          onClick={() => {
            if (!zoomLayerRef.current) return

            if (selectedSpotRef.current) {
              onSelectedSpotChangeRef.current?.(null)
              selectedSpotRef.current = null
            }

            const origin = { x: size.width / 2, y: size.height / 2 }
            const t = transformRef.current
            const next = zoomTransformAtPoint(t, t.k / 1.25, origin)
            animateTransform(next, { durationMs: 200 })
          }}
        >
          <Minus />
        </Button>

        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="重置视图"
          onClick={() => {
            if (selectedSpotRef.current) {
              onSelectedSpotChangeRef.current?.(null)
              selectedSpotRef.current = null
            }

            animateTransform({ x: 0, y: 0, k: 1 }, { durationMs: 220 })
          }}
        >
          <RotateCcw />
        </Button>
      </div>
    </div>
  )
}
