import { z } from "zod"
import { PermissionSchema, permissionFromInt } from "./permission.js"

export const LicensedResourceSchema = z.object({
  accId: z.string().uuid(),
  sysAcc: z.boolean(),
  tenantId: z.string().uuid(),
  accName: z.string(),
  role: z.string(),
  roleId: z.string().uuid(),
  perm: PermissionSchema,
  verified: z.boolean(),
  permitFlags: z.array(z.string()).optional(),
  denyFlags: z.array(z.string()).optional(),
})

export type LicensedResource = z.infer<typeof LicensedResourceSchema>

export function licensedResourceFromUrlString(value: string): LicensedResource {
  let url: URL
  try {
    url = new URL(value, "http://placeholder.local")
  } catch {
    throw new Error(`Invalid licensed resource URL string: ${value}`)
  }

  const segments = url.pathname.split("/").filter(Boolean)
  if (
    segments.length !== 6 ||
    segments[0] !== "t" ||
    segments[2] !== "a" ||
    segments[4] !== "r"
  ) {
    throw new Error(`Invalid path format in licensed resource URL: ${value}`)
  }

  const tenantId = segments[1] as string
  const accId = segments[3] as string
  const roleId = segments[5] as string

  const pParam = url.searchParams.get("p")
  if (pParam === null) {
    throw new Error(`Parameter 'p' not found in: ${value}`)
  }
  const sepIndex = pParam.lastIndexOf(":")
  if (sepIndex === -1) {
    throw new Error(`Invalid 'p' parameter format in: ${value}`)
  }
  const role = pParam.slice(0, sepIndex)
  const perm = permissionFromInt(Number.parseInt(pParam.slice(sepIndex + 1), 10))

  const sParam = url.searchParams.get("s")
  const vParam = url.searchParams.get("v")
  const nParam = url.searchParams.get("n")
  if (sParam === null || vParam === null || nParam === null) {
    throw new Error(`Missing 's'/'v'/'n' parameter in: ${value}`)
  }
  if (sParam !== "0" && sParam !== "1") {
    throw new Error(`Invalid 's' parameter value in: ${value}`)
  }
  if (vParam !== "0" && vParam !== "1") {
    throw new Error(`Invalid 'v' parameter value in: ${value}`)
  }

  const accName = Buffer.from(nParam, "base64").toString("utf-8")

  const pfParam = url.searchParams.get("pf")
  const dfParam = url.searchParams.get("df")

  return LicensedResourceSchema.parse({
    accId,
    sysAcc: sParam === "1",
    tenantId,
    accName,
    role,
    roleId,
    perm,
    verified: vParam === "1",
    permitFlags: pfParam ? pfParam.split(",") : undefined,
    denyFlags: dfParam ? dfParam.split(",") : undefined,
  })
}
