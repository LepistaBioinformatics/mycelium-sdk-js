import { describe, expect, it } from "vitest"
import {
  TenantsOwnershipSchema,
  toOwnershipVector,
} from "./tenantsOwnership.js"

const RECORD = {
  id: "b6a1e6c2-6b1a-4b1a-9b1a-6b1a4b1a9b1a",
  name: "Acme Corp",
  since: "2026-07-12T10:00:00+00:00",
}

describe("TenantsOwnershipSchema", () => {
  it("parses {records: [...]}", () => {
    const parsed = TenantsOwnershipSchema.parse({ records: [RECORD] })
    expect(parsed.kind).toBe("records")
  })

  it("parses {urls: [...]}", () => {
    const parsed = TenantsOwnershipSchema.parse({ urls: ["tid/x"] })
    expect(parsed.kind).toBe("urls")
  })

  it("rejects both keys populated", () => {
    expect(() =>
      TenantsOwnershipSchema.parse({ records: [RECORD], urls: ["tid/x"] })
    ).toThrow()
  })
})

describe("toOwnershipVector", () => {
  it("returns [] for undefined", () => {
    expect(toOwnershipVector(undefined)).toEqual([])
  })

  it("returns records directly", () => {
    const parsed = TenantsOwnershipSchema.parse({ records: [RECORD] })
    const vec = toOwnershipVector(parsed)
    expect(vec).toHaveLength(1)
    expect(vec[0]?.name).toBe("Acme Corp")
  })

  it("parses urls via tenantOwnershipFromUrlString", () => {
    const noHyphens = RECORD.id.replace(/-/g, "")
    const name = Buffer.from("Acme Corp", "utf-8").toString("base64")
    const url = `tid/${noHyphens}?since=2026-07-12T10%3A00%3A00%2B00%3A00&name=${name}`
    const parsed = TenantsOwnershipSchema.parse({ urls: [url] })
    const vec = toOwnershipVector(parsed)
    expect(vec[0]?.id).toBe(RECORD.id)
  })
})
