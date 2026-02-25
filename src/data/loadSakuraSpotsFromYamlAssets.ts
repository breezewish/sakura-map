import { buildSakuraSpotsData, type SakuraSpotsData } from "@/data/sakuraSpotsDataset"
import {
  buildSakuraSpotPredictionsMap,
  mergeSakuraSpotPredictions,
} from "@/data/sakuraSpotPredictionsDataset"

const spotFiles = import.meta.glob<string>("./spots/*.yml", {
  query: "?url",
  import: "default",
})

const spotPredictFiles = import.meta.glob<string>("./spots_predict/*.yml", {
  query: "?url",
  import: "default",
})

async function fetchYamlGlobFiles(
  entries: Array<[string, () => Promise<string>]>,
): Promise<Array<{ filePath: string; raw: string }>> {
  if (entries.length === 0) return []

  return Promise.all(
    entries.map(async ([filePath, loader]) => {
      const url = await loader()
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to fetch ${filePath} (${response.status})`)
      }
      return { filePath, raw: await response.text() }
    }),
  )
}

export async function loadSakuraSpotsFromYamlAssets(): Promise<SakuraSpotsData> {
  const entries = Object.entries(spotFiles)
  if (entries.length === 0) return { prefectures: [], spots: [] }

  const files = await fetchYamlGlobFiles(entries)
  const base = buildSakuraSpotsData(files)

  const predictEntries = Object.entries(spotPredictFiles)
  if (predictEntries.length === 0) return base

  const predictFiles = await fetchYamlGlobFiles(predictEntries)
  const predictions = buildSakuraSpotPredictionsMap(predictFiles)
  const mergedSpots = mergeSakuraSpotPredictions(base.spots, predictions)

  return { ...base, spots: mergedSpots }
}
