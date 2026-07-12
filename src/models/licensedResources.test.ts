import { describe, expect, it } from "vitest"
import {
  LicensedResourcesSchema,
  toLicensesVector,
} from "./licensedResources.js"

const RECORD = {
  accId: "b6a1e6c2-6b1a-4b1a-9b1a-6b1a4b1a9b1a",
  sysAcc: false,
  tenantId: "c2b26c3a-7c2a-4c2a-8c2a-7c2a4c2a8c2a",
  accName: "acc",
  role: "admin",
  roleId: "d3c37c4a-8d3a-4d3a-9d3a-8d3a4d3a9d3a",
  perm: 1 as const,
  verified: true,
}

describe("LicensedResourcesSchema", () => {
  it("parses {records: [...]} into a records-kind union member", () => {
    const parsed = LicensedResourcesSchema.parse({ records: [RECORD] })
    expect(parsed).toEqual({ kind: "records", records: [RECORD] })
  })

  it("parses {urls: [...]} into a urls-kind union member", () => {
    const parsed = LicensedResourcesSchema.parse({ urls: ["t/x"] })
    expect(parsed).toEqual({ kind: "urls", urls: ["t/x"] })
  })

  it("rejects an object with both records and urls populated", () => {
    expect(() =>
      LicensedResourcesSchema.parse({ records: [RECORD], urls: ["t/x"] })
    ).toThrow()
  })

  it("rejects an object with neither key", () => {
    expect(() => LicensedResourcesSchema.parse({})).toThrow()
  })
})

describe("toLicensesVector", () => {
  it("returns records directly for a records-kind union", () => {
    expect(
      toLicensesVector({ kind: "records", records: [RECORD] })
    ).toEqual([RECORD])
  })

  it("returns [] for undefined", () => {
    expect(toLicensesVector(undefined)).toEqual([])
  })

  it("parses urls via licensedResourceFromUrlString for a urls-kind union", () => {
    const name = Buffer.from("acc", "utf-8").toString("base64")
    const url = `t/${RECORD.tenantId}/a/${RECORD.accId}/r/${RECORD.roleId}?p=admin:1&s=0&v=1&n=${name}`
    const result = toLicensesVector({ kind: "urls", urls: [url] })
    expect(result).toEqual([RECORD])
  })
})
