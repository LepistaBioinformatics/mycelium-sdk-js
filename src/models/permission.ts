import { z } from "zod"

export const Permission = {
  READ: 0,
  WRITE: 1,
} as const

export type Permission = (typeof Permission)[keyof typeof Permission]

export const PermissionSchema = z.union([
  z.literal(0),
  z.literal(1),
  // Rust serializes Permission with serde rename_all = camelCase.
  z.literal("read").transform(() => Permission.READ),
  z.literal("write").transform(() => Permission.WRITE),
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
