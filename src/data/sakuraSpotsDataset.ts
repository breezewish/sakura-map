import { parse as parseYaml } from "yaml"

import {
  sakuraPrefectureFileSchema,
  type SakuraPrefectureFile,
  type SakuraSpot,
} from "@/data/sakuraSpotSchema"

export type SakuraSpotsData = {
  prefectures: SakuraPrefectureFile["prefecture"][]
  spots: SakuraSpot[]
}

export function parseSakuraPrefectureFileYaml(
  raw: string,
  filePath: string,
): SakuraPrefectureFile {
  const parsed = parseYaml(raw)
  const result = sakuraPrefectureFileSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Invalid YAML schema in ${filePath}: ${result.error.issues
        .map((i) => `${i.path.join(".") || "<root>"} ${i.message}`)
        .join("; ")}`,
    )
  }
  return result.data
}

export function buildSakuraSpotsData(
  files: Array<{ filePath: string; raw: string }>,
): SakuraSpotsData {
  const prefectures: SakuraPrefectureFile["prefecture"][] = []
  const spots: SakuraSpot[] = []
  const spotIdToFile = new Map<string, string>()

  for (const { filePath, raw } of files) {
    const fileData = parseSakuraPrefectureFileYaml(raw, filePath)
    prefectures.push(fileData.prefecture)

    for (const spot of fileData.spots) {
      const existing = spotIdToFile.get(spot.id)
      if (existing) {
        throw new Error(
          `Duplicate spot id "${spot.id}" found in ${filePath} (already defined in ${existing})`,
        )
      }
      spotIdToFile.set(spot.id, filePath)
      spots.push({ ...spot, prefecture: fileData.prefecture })
    }
  }

  prefectures.sort((a, b) => a.id - b.id)
  spots.sort((a, b) => a.prefecture.id - b.prefecture.id)

  return { prefectures, spots }
}

