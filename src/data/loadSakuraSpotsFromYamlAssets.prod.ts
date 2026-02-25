import type { SakuraSpotsData } from "@/data/sakuraSpotsDataset"

export async function loadSakuraSpotsFromYamlAssets(): Promise<SakuraSpotsData> {
  throw new Error("YAML spot assets are dev-only and not available in production.")
}

