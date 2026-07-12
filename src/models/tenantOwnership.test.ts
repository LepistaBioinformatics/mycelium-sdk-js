import { describe, expect, it } from "vitest"
import {
  TenantOwnershipSchema,
  tenantOwnershipFromUrlString,
} from "./tenantOwnership.js"

const ID = "b6a1e6c2-6b1a-4b1a-9b1a-6b1a4b1a9b1a"

describe("TenantOwnershipSchema", () => {
  it("validates and coerces since into a Date", () => {
    const parsed = TenantOwnershipSchema.parse({
      id: ID,
      name: "Acme Corp",
      since: "2026-07-12T10:00:00+00:00",
    })
    expect(parsed.since).toBeInstanceOf(Date)
    expect(parsed.name).toBe("Acme Corp")
  })

  it("rejects an invalid id", () => {
    expect(() =>
      TenantOwnershipSchema.parse({
        id: "not-a-uuid",
        name: "x",
        since: "2026-07-12T10:00:00+00:00",
      })
    ).toThrow()
  })
})

describe("tenantOwnershipFromUrlString", () => {
  it("parses the tid/{noHyphens}?since=...&name=... scheme", () => {
    const noHyphens = ID.replace(/-/g, "")
    const name = Buffer.from("Acme Corp", "utf-8").toString("base64")
    const url = `tid/${noHyphens}?since=2026-07-12T10%3A00%3A00%2B00%3A00&name=${name}`
    const parsed = tenantOwnershipFromUrlString(url)
    expect(parsed.id).toBe(ID)
    expect(parsed.name).toBe("Acme Corp")
    expect(parsed.since).toBeInstanceOf(Date)
  })

  it("throws on an invalid path scheme", () => {
    expect(() =>
      tenantOwnershipFromUrlString("wrong/path?since=x&name=eA==")
    ).toThrow()
  })

  it("throws on a missing since/name parameter", () => {
    const noHyphens = ID.replace(/-/g, "")
    expect(() => tenantOwnershipFromUrlString(`tid/${noHyphens}`)).toThrow()
  })
})
