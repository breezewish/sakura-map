import type { SakuraSpot } from "@/data/sakuraSpotSchema"

export const SAKURA100_MARKER_COLOR = "#f472b6" // tailwind pink-400
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
  return isSakura100Spot(spot) ? SAKURA100_MARKER_COLOR : OTHER_MARKER_COLOR
}

export function getSpotMarkerColorClass(spot: SakuraSpot) {
  return isSakura100Spot(spot) ? "fill-pink-400" : "fill-blue-400"
}
