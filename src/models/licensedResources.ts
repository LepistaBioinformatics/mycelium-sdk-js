import { z } from "zod"
import {
  LicensedResourceSchema,
  licensedResourceFromUrlString,
  type LicensedResource,
} from "./licensedResource.js"

function tagRecordsOrUrls(raw: unknown) {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>
    const hasRecords = "records" in obj
    const hasUrls = "urls" in obj
    if (hasRecords && !hasUrls) {
      return { kind: "records", records: obj.records }
    }
    if (hasUrls && !hasRecords) {
      return { kind: "urls", urls: obj.urls }
    }
  }
  return raw
}

export const LicensedResourcesSchema = z.preprocess(
  tagRecordsOrUrls,
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("records"),
      records: z.array(LicensedResourceSchema),
    }),
    z.object({
      kind: z.literal("urls"),
      urls: z.array(z.string()),
    }),
  ])
)

export type LicensedResources = z.infer<typeof LicensedResourcesSchema>

export function toLicensesVector(
  lr: LicensedResources | undefined
): LicensedResource[] {
  if (!lr) return []
  if (lr.kind === "records") return lr.records
  return lr.urls.map(licensedResourceFromUrlString)
}
