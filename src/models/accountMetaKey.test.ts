import { describe, expect, it } from "vitest"
import { AccountMetaKeySchema, ProfileMetaSchema } from "./accountMetaKey.js"

describe("AccountMetaKeySchema", () => {
  it("accepts the 4 known keys", () => {
    for (const key of [
      "phone_number",
      "telegram_user",
      "whatsapp_user",
      "locale",
    ]) {
      expect(AccountMetaKeySchema.parse(key)).toBe(key)
    }
  })

  it("accepts any custom:<key> string", () => {
    expect(AccountMetaKeySchema.parse("custom:foo")).toBe("custom:foo")
  })

  it("rejects an arbitrary non-matching string", () => {
    expect(() => AccountMetaKeySchema.parse("invalid_key")).toThrow()
  })
})

describe("ProfileMetaSchema", () => {
  it("validates a meta map matching the gateway's wire format", () => {
    const parsed = ProfileMetaSchema.parse({
      locale: "en-US",
      "custom:foo": "bar",
    })
    expect(parsed).toEqual({ locale: "en-US", "custom:foo": "bar" })
  })

  it("rejects a map with an invalid key", () => {
    expect(() => ProfileMetaSchema.parse({ invalid_key: "x" })).toThrow()
  })
})
