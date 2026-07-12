import { z } from "zod"

export const Permission = {
  READ: 0,
  WRITE: 1,
} as const

export type Permission = (typeof Permission)[keyof typeof Permission]

export const PermissionSchema: z.ZodType<Permission> = z.union([
  z.literal(0),
  z.literal(1),
])

export function permissionToInt(permission: Permission): number {
  return permission
}

export function permissionFromInt(value: number): Permission {
  if (value === Permission.READ || value === Permission.WRITE) {
    return value
  }
  throw new Error(`Invalid permission code: ${value}`)
}
