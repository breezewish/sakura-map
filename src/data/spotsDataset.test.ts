import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { buildSakuraSpotsData } from "@/data/sakuraSpotsDataset"

describe("spots dataset", () => {
  it("all prefecture yml files are valid and spot ids are unique", async () => {
    const dir = path.join(process.cwd(), "src", "data", "spots")
    const fileNames = (await readdir(dir))
      .filter((f) => f.endsWith(".yml"))
      .sort()

    expect(fileNames.length).toBe(47)

    const files = await Promise.all(
      fileNames.map(async (fileName) => ({
        filePath: `./spots/${fileName}`,
        raw: await readFile(path.join(dir, fileName), "utf8"),
      })),
    )

    const data = buildSakuraSpotsData(files)
    expect(data.prefectures).toHaveLength(47)
    expect(data.spots.length).toBeGreaterThan(0)
  })
})
