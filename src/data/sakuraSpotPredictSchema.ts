import { z } from "zod"

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "Expected ISO date string (YYYY-MM-DD)",
})

export const sakuraSpotPredictionSchema = z
  .object({
    forecasted_at: isoDateSchema.optional(),
    first_bloom_date: isoDateSchema.optional(),
    full_bloom_date: isoDateSchema.optional(),
    fubuki_date: isoDateSchema.optional(),
  })
  .refine((p) => Object.values(p).some((v) => typeof v === "string"), {
    message: "Prediction object is empty",
  })

export const sakuraSpotPredictInPrefectureFileSchema = z.object({
  id: z.string().min(1),
  predict: sakuraSpotPredictionSchema.optional(),
})

export const sakuraPrefecturePredictFileSchema = z.object({
  prefecture: z.object({
    id: z.number().int().min(1).max(47),
    name_ja: z.string().min(1),
    name_en: z.string().min(1).optional(),
  }),
  spots: z.array(sakuraSpotPredictInPrefectureFileSchema),
})

export type SakuraSpotPrediction = z.infer<typeof sakuraSpotPredictionSchema>
export type SakuraSpotPredictInPrefectureFile = z.infer<
  typeof sakuraSpotPredictInPrefectureFileSchema
>
export type SakuraPrefecturePredictFile = z.infer<
  typeof sakuraPrefecturePredictFileSchema
>
