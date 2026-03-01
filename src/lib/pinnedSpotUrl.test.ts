import { describe, expect, it } from "vitest"

import {
  getPinnedSpotIdFromUrl,
  getUrlWithPinnedSpotId,
  PINNED_SPOT_ID_QUERY_KEY,
} from "@/lib/pinnedSpotUrl"

describe("getPinnedSpotIdFromUrl", () => {
  it("returns null when param missing/blank", () => {
    expect(getPinnedSpotIdFromUrl(new URL("https://example.com/"))).toBeNull()
    expect(getPinnedSpotIdFromUrl(new URL("https://example.com/?spot="))).toBeNull()
    expect(getPinnedSpotIdFromUrl(new URL("https://example.com/?spot=%20%20"))).toBeNull()
  })

  it("returns trimmed id", () => {
    expect(getPinnedSpotIdFromUrl(new URL("https://example.com/?spot=foo"))).toBe("foo")
    expect(getPinnedSpotIdFromUrl(new URL("https://example.com/?spot=%20foo%20"))).toBe("foo")
  })
})

describe("getUrlWithPinnedSpotId", () => {
  it("sets and deletes pinned spot id without mutating input url", () => {
    const url = new URL("https://example.com/?a=1#hash")
    const next = getUrlWithPinnedSpotId(url, "spot-123")

    expect(url.toString()).toBe("https://example.com/?a=1#hash")
    expect(next.searchParams.get("a")).toBe("1")
    expect(next.searchParams.get(PINNED_SPOT_ID_QUERY_KEY)).toBe("spot-123")
    expect(next.hash).toBe("#hash")

    const cleared = getUrlWithPinnedSpotId(next, null)
    expect(cleared.searchParams.get("a")).toBe("1")
    expect(cleared.searchParams.get(PINNED_SPOT_ID_QUERY_KEY)).toBeNull()
    expect(cleared.hash).toBe("#hash")
  })
})
