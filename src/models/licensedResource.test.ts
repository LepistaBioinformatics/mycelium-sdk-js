import { describe, expect, it } from "vitest"
import {
  LicensedResourceSchema,
  licensedResourceFromUrlString,
} from "./licensedResource.js"

const TENANT_ID = "b6a1e6c2-6b1a-4b1a-9b1a-6b1a4b1a9b1a"
const ACC_ID = "c2b26c3a-7c2a-4c2a-8c2a-7c2a4c2a8c2a"
const ROLE_ID = "d3c37c4a-8d3a-4d3a-9d3a-8d3a4d3a9d3a"

const VALID = {
  accId: ACC_ID,
  sysAcc: false,
  tenantId: TENANT_ID,
  accName: "some-account",
  role: "admin",
  roleId: ROLE_ID,
  perm: 1,
  verified: true,
}

describe("LicensedResourceSchema", () => {
  it("validates a record without permitFlags/denyFlags", () => {
    expect(LicensedResourceSchema.parse(VALID)).toEqual(VALID)
  })

  it("validates a record with permitFlags/denyFlags", () => {
    const withFlags = {
      ...VALID,
      permitFlags: ["managementScreen"],
      denyFlags: ["clickToAction"],
    }
    expect(LicensedResourceSchema.parse(withFlags)).toEqual(withFlags)
  })

  it("rejects an invalid perm value", () => {
    expect(() => LicensedResourceSchema.parse({ ...VALID, perm: 2 })).toThrow()
  })
})

describe("licensedResourceFromUrlString", () => {
  function buildUrl(opts: {
    pf?: string
    df?: string
    s?: string
    v?: string
  }): string {
    const name = Buffer.from("some-account", "utf-8").toString("base64")
    let url = `t/${TENANT_ID}/a/${ACC_ID}/r/${ROLE_ID}?p=admin:1&s=${
      opts.s ?? "0"
    }&v=${opts.v ?? "1"}&n=${name}`
    if (opts.pf) url += `&pf=${opts.pf}`
    if (opts.df) url += `&df=${opts.df}`
    return url
  }

  it("parses a valid URL string without pf/df", () => {
    const parsed = licensedResourceFromUrlString(buildUrl({}))
    expect(parsed).toEqual({
      accId: ACC_ID,
      sysAcc: false,
      tenantId: TENANT_ID,
      accName: "some-account",
      role: "admin",
      roleId: ROLE_ID,
      perm: 1,
      verified: true,
    })
  })

  it("parses pf/df as comma-separated flag lists", () => {
    const parsed = licensedResourceFromUrlString(
      buildUrl({ pf: "managementScreen,clickToAction", df: "denyThis" })
    )
    expect(parsed.permitFlags).toEqual(["managementScreen", "clickToAction"])
    expect(parsed.denyFlags).toEqual(["denyThis"])
  })

  it("parses sysAcc=true and verified=false correctly", () => {
    const parsed = licensedResourceFromUrlString(buildUrl({ s: "1", v: "0" }))
    expect(parsed.sysAcc).toBe(true)
    expect(parsed.verified).toBe(false)
  })

  it("throws on missing path segments", () => {
    expect(() =>
      licensedResourceFromUrlString(`t/${TENANT_ID}/a/${ACC_ID}?p=admin:1&s=0&v=1&n=eA==`)
    ).toThrow()
  })

  it("throws on an invalid UUID segment", () => {
    expect(() =>
      licensedResourceFromUrlString(
        `t/not-a-uuid/a/${ACC_ID}/r/${ROLE_ID}?p=admin:1&s=0&v=1&n=eA==`
      )
    ).toThrow()
  })

  it("throws on a missing 'p' parameter", () => {
    expect(() =>
      licensedResourceFromUrlString(
        `t/${TENANT_ID}/a/${ACC_ID}/r/${ROLE_ID}?s=0&v=1&n=eA==`
      )
    ).toThrow()
  })

  it("throws on an invalid 's' or 'v' value", () => {
    expect(() =>
      licensedResourceFromUrlString(
        `t/${TENANT_ID}/a/${ACC_ID}/r/${ROLE_ID}?p=admin:1&s=2&v=1&n=eA==`
      )
    ).toThrow()
  })

  it("throws on a malformed URL string", () => {
    expect(() => licensedResourceFromUrlString("not a url at all::::")).toThrow()
  })
})
