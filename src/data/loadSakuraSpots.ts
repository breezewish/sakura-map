import type { SakuraSpotsData } from "@/data/sakuraSpotsDataset"

export type { SakuraSpotsData } from "@/data/sakuraSpotsDataset"

const PREBUILT_SPOTS_JSON_URL = `${import.meta.env.BASE_URL}data/spots.json`

let cachedPromise: Promise<SakuraSpotsData> | null = null

async function tryLoadPrebuiltSpotsJson(): Promise<SakuraSpotsData | null> {
  const response = await fetch(PREBUILT_SPOTS_JSON_URL)
  if (!response.ok) return null

  const data = (await response.json()) as unknown
  if (!data || typeof data !== "object") {
    throw new Error("Invalid spots.json format (expected object)")
  }

  const { prefectures, spots } = data as Partial<SakuraSpotsData>
  if (!Array.isArray(prefectures) || !Array.isArray(spots)) {
    throw new Error("Invalid spots.json format (missing arrays)")
  }

  return data as SakuraSpotsData
}

async function loadFromYamlAssets(): Promise<SakuraSpotsData> {
  const { loadSakuraSpotsFromYamlAssets } = await import(
    "@/data/loadSakuraSpotsFromYamlAssets"
  )
  return loadSakuraSpotsFromYamlAssets()
}

export async function loadSakuraSpots(): Promise<SakuraSpotsData> {
  if (cachedPromise) return cachedPromise

  cachedPromise = (async () => {
    // If the prebuilt file exists but is broken, fail loudly by letting errors bubble up.
    const prebuilt = await tryLoadPrebuiltSpotsJson()
    if (prebuilt) return prebuilt

    // In dev, allow falling back to YAML assets for local iteration.
    if (import.meta.env.DEV) {
      return loadFromYamlAssets()
    }

    throw new Error(
      `Missing prebuilt dataset: ${PREBUILT_SPOTS_JSON_URL}. Did you run "npm run build"?`,
    )
  })()

  return cachedPromise
}
