import { z } from "zod"

import type { SakuraSpotPredict } from "@/data/sakuraSpotPredictSchema"

export const sakuraCollectionSchema = z.enum([
  "sakura100",
  "navitime",
  "weathernews",
  "weathernews_top10",
])

export const sakuraPhotoSchema = z.object({
  url: z.string().min(1),
  source_url: z.string().min(1).optional(),
  credit: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
})

export const sakuraSourceSchema = z.object({
  url: z.string().min(1),
  label: z.string().min(1).optional(),
})

export const sakuraSpotInPrefectureFileSchema = z.object({
  id: z.string().min(1),
  name_ja: z.string().min(1),
  name_en: z.string().min(1).optional(),
  location: z
    .object({
      city_ja: z.string().min(1).optional(),
      area_ja: z.string().min(1).optional(),
      address_ja: z.string().min(1).optional(),
    })
    .optional(),
  geo: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  trees: z.number().int().positive().optional(),
  species_ja: z.array(z.string().min(1)).optional(),
  description_ja: z.string().min(1).optional(),
  photos: z.array(sakuraPhotoSchema).optional(),
  sources: z.array(sakuraSourceSchema).optional(),
  links: z
    .object({
      navitime: z.string().min(1).optional(),
      weathernews: z.string().min(1).optional(),
      wikipedia: z.string().min(1).optional(),
    })
    .optional(),
  top: z
    .object({
      weathernews: z.number().int().min(1).optional(),
    })
    .optional(),
  collections: z.array(sakuraCollectionSchema).optional(),
  note: z.string().min(1).optional(),
})

export const sakuraPrefectureFileSchema = z.object({
  prefecture: z.object({
    id: z.number().int().min(1).max(47),
    name_ja: z.string().min(1),
    name_en: z.string().min(1).optional(),
  }),
  spots: z.array(sakuraSpotInPrefectureFileSchema),
})

export type SakuraCollection = z.infer<typeof sakuraCollectionSchema>
export type SakuraPrefectureFile = z.infer<typeof sakuraPrefectureFileSchema>
export type SakuraSpotInPrefectureFile = z.infer<
  typeof sakuraSpotInPrefectureFileSchema
>

export type SakuraSpot = SakuraSpotInPrefectureFile & {
  prefecture: SakuraPrefectureFile["prefecture"]
  predict?: SakuraSpotPredict
}
