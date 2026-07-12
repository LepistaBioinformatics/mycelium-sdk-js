import { z } from "zod"

export const VerboseStatusSchema = z.enum([
  "unverified",
  "verified",
  "inactive",
  "archived",
  "deleted",
  "unknown",
])

export type VerboseStatus = z.infer<typeof VerboseStatusSchema>
