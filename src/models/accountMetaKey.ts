import { z } from "zod"

const KNOWN_KEYS = [
  "phone_number",
  "telegram_user",
  "whatsapp_user",
  "locale",
] as const

export type AccountMetaKey = (typeof KNOWN_KEYS)[number] | `custom:${string}`

export const AccountMetaKeySchema = z
  .string()
  .refine(
    (value): value is AccountMetaKey =>
      (KNOWN_KEYS as readonly string[]).includes(value) ||
      value.startsWith("custom:"),
    {
      message:
        "must be one of phone_number, telegram_user, whatsapp_user, locale, or a custom:<key> string",
    }
  )

export const ProfileMetaSchema = z.record(AccountMetaKeySchema, z.string())

export type ProfileMeta = z.infer<typeof ProfileMetaSchema>
