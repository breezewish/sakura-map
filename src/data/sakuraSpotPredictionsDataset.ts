import { parse as parseYaml } from "yaml"

import type { SakuraSpot } from "@/data/sakuraSpotSchema"
import {
  sakuraPrefecturePredictFileSchema,
  type SakuraPrefecturePredictFile,
  type SakuraSpotPrediction,
} from "@/data/sakuraSpotPredictSchema"

export function parseSakuraPrefecturePredictFileYaml(
  raw: string,
  filePath: string,
): SakuraPrefecturePredictFile {
  const parsed = parseYaml(raw)
  const result = sakuraPrefecturePredictFileSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Invalid YAML schema in ${filePath}: ${result.error.issues
        .map((i) => `${i.path.join(".") || "<root>"} ${i.message}`)
        .join("; ")}`,
    )
  }
  return result.data
}

export function buildSakuraSpotPredictionsMap(
  files: Array<{ filePath: string; raw: string }>,
): Map<string, SakuraSpotPrediction> {
  const spotIdToFile = new Map<string, string>()
  const predictions = new Map<string, SakuraSpotPrediction>()

  for (const { filePath, raw } of files) {
    const fileData = parseSakuraPrefecturePredictFileYaml(raw, filePath)

    for (const spot of fileData.spots) {
      const existing = spotIdToFile.get(spot.id)
      if (existing) {
        throw new Error(
          `Duplicate spot id "${spot.id}" found in ${filePath} (already defined in ${existing})`,
        )
      }
      spotIdToFile.set(spot.id, filePath)

      if (spot.predict) predictions.set(spot.id, spot.predict)
    }
  }

  return predictions
}

export function mergeSakuraSpotPredictions(
  spots: SakuraSpot[],
  predictions: Map<string, SakuraSpotPrediction>,
): SakuraSpot[] {
  if (predictions.size === 0) return spots

  return spots.map((spot) => {
    const predict = predictions.get(spot.id)
    if (!predict) return spot
    return { ...spot, predict }
  })
}
