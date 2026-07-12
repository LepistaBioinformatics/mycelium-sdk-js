import { z } from "zod"
import {
  TenantOwnershipSchema,
  tenantOwnershipFromUrlString,
  type TenantOwnership,
} from "./tenantOwnership.js"

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

export const TenantsOwnershipSchema = z.preprocess(
  tagRecordsOrUrls,
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("records"),
      records: z.array(TenantOwnershipSchema),
    }),
    z.object({
      kind: z.literal("urls"),
      urls: z.array(z.string()),
    }),
  ])
)

export type TenantsOwnership = z.infer<typeof TenantsOwnershipSchema>

export function toOwnershipVector(
  to: TenantsOwnership | undefined
): TenantOwnership[] {
  if (!to) return []
  if (to.kind === "records") return to.records
  return to.urls.map(tenantOwnershipFromUrlString)
}
