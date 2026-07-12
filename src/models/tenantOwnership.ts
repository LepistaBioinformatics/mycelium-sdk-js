import { z } from "zod"

export const TenantOwnershipSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  since: z.coerce.date(),
})

export type TenantOwnership = z.infer<typeof TenantOwnershipSchema>

function reinsertUuidHyphens(noHyphens: string): string {
  if (!/^[0-9a-fA-F]{32}$/.test(noHyphens)) {
    throw new Error(`Invalid unhyphenated UUID: ${noHyphens}`)
  }
  return [
    noHyphens.slice(0, 8),
    noHyphens.slice(8, 12),
    noHyphens.slice(12, 16),
    noHyphens.slice(16, 20),
    noHyphens.slice(20, 32),
  ].join("-")
}

export function tenantOwnershipFromUrlString(value: string): TenantOwnership {
  let url: URL
  try {
    url = new URL(value, "http://placeholder.local")
  } catch {
    throw new Error(`Invalid tenant ownership URL string: ${value}`)
  }

  const segments = url.pathname.split("/").filter(Boolean)
  if (segments.length !== 2 || segments[0] !== "tid") {
    throw new Error(`Invalid path format in tenant ownership URL: ${value}`)
  }

  const id = reinsertUuidHyphens(segments[1] as string)

  const since = url.searchParams.get("since")
  const nameEncoded = url.searchParams.get("name")
  if (since === null || nameEncoded === null) {
    throw new Error(`Missing 'since'/'name' parameter in: ${value}`)
  }

  const name = Buffer.from(nameEncoded, "base64").toString("utf-8")

  return TenantOwnershipSchema.parse({ id, name, since })
}
