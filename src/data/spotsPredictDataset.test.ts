import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { buildSakuraSpotPredictionsMap } from "@/data/sakuraSpotPredictionsDataset"

describe("spots_predict dataset", () => {
  it("all prefecture yml files are valid and spot ids are unique", async () => {
    const dir = path.join(process.cwd(), "src", "data", "spots_predict")
    const fileNames = (await readdir(dir))
      .filter((f) => f.endsWith(".yml"))
      .sort()

    expect(fileNames.length).toBe(47)

    const files = await Promise.all(
      fileNames.map(async (fileName) => ({
        filePath: `./spots_predict/${fileName}`,
        raw: await readFile(path.join(dir, fileName), "utf8"),
      })),
    )

    const predictions = buildSakuraSpotPredictionsMap(files)
    expect(predictions.size).toBeGreaterThan(0)
  })
})

