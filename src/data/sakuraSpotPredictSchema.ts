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

const legacyPredictionKeys = [
  "forecasted_at",
  "first_bloom_date",
  "full_bloom_date",
  "fubuki_date",
] as const

export const sakuraSpotPredictSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const obj = value as Record<string, unknown>

  // Legacy format (pre-2026-03): predict: { forecasted_at, ... }.
  // Normalize it to the new format: predict: { weathernews: { ... } }.
  if (!("weathernews" in obj) && !("jmc" in obj)) {
    const isLegacy =
      legacyPredictionKeys.some((k) => k in obj) &&
      legacyPredictionKeys.every((k) => !(k in obj) || obj[k] != null)
    if (isLegacy) return { weathernews: obj }
  }

  return value
}, sakuraSpotPredictSourcesSchema)

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
