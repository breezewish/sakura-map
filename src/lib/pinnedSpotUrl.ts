export const PINNED_SPOT_ID_QUERY_KEY = "spot"

export function getPinnedSpotIdFromUrl(url: URL): string | null {
  const value = url.searchParams.get(PINNED_SPOT_ID_QUERY_KEY)
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function getUrlWithPinnedSpotId(url: URL, pinnedSpotId: string | null): URL {
  const next = new URL(url.toString())

  if (pinnedSpotId) {
    next.searchParams.set(PINNED_SPOT_ID_QUERY_KEY, pinnedSpotId)
  } else {
    next.searchParams.delete(PINNED_SPOT_ID_QUERY_KEY)
  }

  return next
}

