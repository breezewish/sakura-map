import { buildSakuraSpotsData, type SakuraSpotsData } from "@/data/sakuraSpotsDataset"

const spotFiles = import.meta.glob<string>("./spots/*.yml", {
  query: "?url",
  import: "default",
})

export async function loadSakuraSpotsFromYamlAssets(): Promise<SakuraSpotsData> {
  const entries = Object.entries(spotFiles)
  if (entries.length === 0) return { prefectures: [], spots: [] }

  const files = await Promise.all(
    entries.map(async ([filePath, loader]) => {
      const url = await loader()
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to fetch ${filePath} (${response.status})`)
      }
      return { filePath, raw: await response.text() }
    }),
  )

  return buildSakuraSpotsData(files)
}

