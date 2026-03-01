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
  .strict()
  .refine((p) => Object.values(p).some((v) => typeof v === "string"), {
    message: "Prediction object is empty",
  })

const sakuraSpotPredictSourcesSchema = z
  .object({
    weathernews: sakuraSpotPredictionSchema.optional(),
    // Japan Meteorological Corporation (JMC): reserved for future use.
    jmc: sakuraSpotPredictionSchema.optional(),
  })
  .strict()
  .refine((p) => Object.values(p).some((v) => v != null), {
    message: "Predict object has no sources",
  })

export const sakuraSpotPredictSchema = sakuraSpotPredictSourcesSchema

export const sakuraSpotPredictInPrefectureFileSchema = z.object({
  id: z.string().min(1),
  predict: sakuraSpotPredictSchema.optional(),
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
export type SakuraSpotPredict = z.infer<typeof sakuraSpotPredictSchema>
export type SakuraSpotPredictInPrefectureFile = z.infer<
  typeof sakuraSpotPredictInPrefectureFileSchema
>
export type SakuraPrefecturePredictFile = z.infer<
  typeof sakuraPrefecturePredictFileSchema
>
