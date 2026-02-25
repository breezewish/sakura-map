import type { SakuraCollection, SakuraSpot } from "@/data/sakuraSpotSchema"

export type SakuraSpotFilters = {
  prefectureId: number | null
  collection: SakuraCollection | null
}

export function filterSakuraSpots(
  spots: SakuraSpot[],
  filters: SakuraSpotFilters,
) {
  const { prefectureId, collection } = filters

  if (prefectureId === null && collection === null) return spots

  return spots.filter((spot) => {
    if (prefectureId !== null && spot.prefecture.id !== prefectureId) {
      return false
    }
    if (collection !== null && !spot.collections?.includes(collection)) {
      return false
    }
    return true
  })
}

