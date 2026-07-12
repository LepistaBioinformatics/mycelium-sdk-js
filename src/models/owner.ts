import { z } from "zod"

export const OwnerSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  username: z.string().optional(),
  isPrincipal: z.boolean(),
})

export type Owner = z.infer<typeof OwnerSchema>
