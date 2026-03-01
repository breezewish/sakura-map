import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { SakuraSpotsData } from "@/data/loadSakuraSpots"
import type { SakuraCollection, SakuraSpot } from "@/data/sakuraSpotSchema"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { filterSakuraSpots } from "@/lib/sakuraSpotFilters"
import {
  OTHER_MARKER_COLOR,
  SAKURA100_MARKER_COLOR,
  WEATHERNEWS_TOP10_MARKER_COLOR,
} from "@/lib/spotMarker"
import { getPinnedSpotIdFromUrl, getUrlWithPinnedSpotId } from "@/lib/pinnedSpotUrl"
import { Flower2 } from "lucide-react"

const JapanPrefectureMap = lazy(() =>
  import("@/components/JapanPrefectureMap").then((module) => ({
    default: module.JapanPrefectureMap,
  })),
)

function App() {
  const [data, setData] = useState<SakuraSpotsData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pinnedSpotLinkError, setPinnedSpotLinkError] = useState<string | null>(null)

  const [prefectureFilter, setPrefectureFilter] = useState<string>("all")
  const [collectionFilter, setCollectionFilter] = useState<string>("all")

  const [pinnedSpotId, setPinnedSpotId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return getPinnedSpotIdFromUrl(new URL(window.location.href))
  })
  const initialPinnedSpotIdRef = useRef<string | null>(pinnedSpotId)

  const [selectedSpot, setSelectedSpot] = useState<SakuraSpot | null>(null)
  const [selectedSpotMode, setSelectedSpotMode] = useState<"hover" | "pinned" | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const { loadSakuraSpots } = await import("@/data/loadSakuraSpots")
        const d = await loadSakuraSpots()
        if (cancelled) return
        setData(d)
      } catch (error) {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : "Unknown error")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const next = getUrlWithPinnedSpotId(new URL(window.location.href), pinnedSpotId)
    if (next.toString() === window.location.href) return

    window.history.replaceState(null, "", next)
  }, [pinnedSpotId])

  useEffect(() => {
    if (!data) return
    if (!pinnedSpotId) return

    const spot = data.spots.find((item) => item.id === pinnedSpotId) ?? null
    if (!spot) {
      setPinnedSpotLinkError(`链接中的景点不存在：${pinnedSpotId}`)
      setPinnedSpotId(null)
      setSelectedSpot(null)
      setSelectedSpotMode(null)
      return
    }

    setPinnedSpotLinkError(null)
    setSelectedSpot(spot)
    setSelectedSpotMode("pinned")
  }, [data, pinnedSpotId])

  const filteredSpots = useMemo(() => {
    if (!data) return []

    const prefectureId =
      prefectureFilter === "all" ? null : Number(prefectureFilter)

    const collection =
      collectionFilter === "all"
        ? null
        : (collectionFilter as SakuraCollection)

    return filterSakuraSpots(data.spots, { prefectureId, collection })
  }, [collectionFilter, data, prefectureFilter])

  const handleSelectedSpotChange = useCallback(
    (spot: SakuraSpot | null, options?: { pin?: boolean }) => {
      if (!spot) {
        setSelectedSpot(null)
        setSelectedSpotMode(null)
        setPinnedSpotId(null)
        return
      }

      if (options?.pin) {
        setPinnedSpotLinkError(null)
        setSelectedSpot(spot)
        setSelectedSpotMode("pinned")
        setPinnedSpotId(spot.id)
        return
      }

      setSelectedSpot(spot)
      setSelectedSpotMode("hover")
    },
    [],
  )

  const handleCollectionFilterChange = useCallback((value: string) => {
    setCollectionFilter(value)
    setSelectedSpot(null)
    setSelectedSpotMode(null)
    setPinnedSpotId(null)
    setPinnedSpotLinkError(null)
  }, [])

  const handlePrefectureFilterChange = useCallback((value: string) => {
    setPrefectureFilter(value)
    setSelectedSpot(null)
    setSelectedSpotMode(null)
    setPinnedSpotId(null)
    setPinnedSpotLinkError(null)
  }, [])

  return (
    <div className="relative h-full w-full">
      <Suspense
        fallback={
          <div className="absolute inset-0 grid place-items-center bg-[#F4F5F7] text-sm text-muted-foreground">
            正在加载地图…
          </div>
        }
      >
        <JapanPrefectureMap
          spots={filteredSpots}
          selectedSpot={selectedSpot}
          pinnedSpotId={selectedSpotMode === "pinned" ? pinnedSpotId : null}
          initialPinnedSpotId={initialPinnedSpotIdRef.current}
          onSelectedSpotChange={handleSelectedSpotChange}
        />
      </Suspense>

      <div className="absolute left-4 top-4 z-10 w-[320px] rounded-xl bg-white/95 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#D4AF37]/15 text-[#8a6d1f]">
            <Flower2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight tracking-tight">
              樱花地图
            </div>
            <div className="text-xs text-muted-foreground">
              探索日本樱花名所与花见景点
            </div>
          </div>
        </div>

        {loadError && (
          <div className="mb-2 text-sm text-destructive">加载数据失败：{loadError}</div>
        )}

        {pinnedSpotLinkError && (
          <div className="mb-2 text-sm text-destructive">{pinnedSpotLinkError}</div>
        )}

        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <Select
              value={collectionFilter}
              onValueChange={handleCollectionFilterChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="全部集合" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部集合</SelectItem>
                <SelectItem value="sakura100">日本さくら名所100選</SelectItem>
                <SelectItem value="navitime">NAVITIME</SelectItem>
                <SelectItem value="weathernews">Weathernews</SelectItem>
                <SelectItem value="weathernews_top10">Weathernews Top10</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Select
              value={prefectureFilter}
              onValueChange={handlePrefectureFilterChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="全部县" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部县</SelectItem>
                {data?.prefectures.map((pref) => (
                  <SelectItem key={pref.id} value={String(pref.id)}>
                    {pref.name_ja}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="text-muted-foreground">
                显示 <span className="font-medium text-foreground">{filteredSpots.length}</span>{" "}
                / {data?.spots.length ?? 0} 个景点
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: SAKURA100_MARKER_COLOR }}
                />
                <span>名所100选</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: WEATHERNEWS_TOP10_MARKER_COLOR }}
                />
                <span>Weathernews Top10</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: OTHER_MARKER_COLOR }}
                />
                <span>其他景点</span>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

export default App
