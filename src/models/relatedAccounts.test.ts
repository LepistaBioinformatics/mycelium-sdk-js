import { describe, expect, it } from "vitest"
import type { RelatedAccounts } from "./relatedAccounts.js"

function assertExhaustive(x: never): never {
  throw new Error(`Unreachable variant: ${JSON.stringify(x)}`)
}

function describeKind(ra: RelatedAccounts): string {
  switch (ra.kind) {
    case "AllowedAccounts":
      return `allowed:${ra.accounts.length}`
    case "HasTenantWidePrivileges":
      return `tenantWide:${ra.tenantId}`
    case "HasStaffPrivileges":
      return "staff"
    case "HasManagerPrivileges":
      return "manager"
    default:
      return assertExhaustive(ra)
  }
}

describe("RelatedAccounts", () => {
  it("covers all 4 variants exhaustively (compile-time check via assertExhaustive)", () => {
    expect(describeKind({ kind: "AllowedAccounts", accounts: ["a"] })).toBe(
      "allowed:1"
    )
    expect(
      describeKind({ kind: "HasTenantWidePrivileges", tenantId: "t1" })
    ).toBe("tenantWide:t1")
    expect(describeKind({ kind: "HasStaffPrivileges" })).toBe("staff")
    expect(describeKind({ kind: "HasManagerPrivileges" })).toBe("manager")
  })
})
