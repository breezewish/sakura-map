import type { SakuraSpot } from "@/data/sakuraSpotSchema"

export const SAKURA100_MARKER_COLOR = "#f472b6" // tailwind pink-400
export const WEATHERNEWS_TOP10_MARKER_COLOR = "#fdba74" // tailwind orange-300
export const OTHER_MARKER_COLOR = "#60a5fa" // tailwind blue-400

export function getMarkerRadiusFromTrees(trees: number | undefined) {
  if (typeof trees !== "number") return 4
  if (trees < 500) return 4
  if (trees < 2000) return 6
  return 8
}

export function getSpotMarkerRadius(spot: SakuraSpot) {
  return getMarkerRadiusFromTrees(spot.trees)
}

export function isSakura100Spot(spot: SakuraSpot) {
  return spot.collections?.includes("sakura100") ?? false
}

export function getSpotMarkerColor(spot: SakuraSpot) {
  if (isSakura100Spot(spot)) return SAKURA100_MARKER_COLOR
  if (spot.collections?.includes("weathernews_top10")) {
    return WEATHERNEWS_TOP10_MARKER_COLOR
  }
  return OTHER_MARKER_COLOR
}

export function getSpotMarkerColorClass(spot: SakuraSpot) {
  if (isSakura100Spot(spot)) return "fill-pink-400"
  if (spot.collections?.includes("weathernews_top10")) return "fill-orange-300"
  return "fill-blue-400"
}
