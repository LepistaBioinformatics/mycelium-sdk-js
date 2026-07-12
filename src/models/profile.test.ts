import { describe, expect, it } from "vitest"
import {
  InsufficientLicensesError,
  InsufficientPrivilegesError,
} from "../errors.js"
import { Profile, ProfileSchema } from "./profile.js"

const TENANT_A = "b6a1e6c2-6b1a-4b1a-9b1a-6b1a4b1a9b1a"
const TENANT_B = "c2b26c3a-7c2a-4c2a-8c2a-7c2a4c2a8c2a"
const ACC_1 = "d3c37c4a-8d3a-4d3a-9d3a-8d3a4d3a9d3a"
const ACC_2 = "e4d48d5a-9e4a-4e4a-8e4a-9e4a4e4a8e4a"
const ROLE_ID = "f5e59e6a-0f5a-4f5a-9f5a-0f5a4f5a9f5a"

function resource(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    accId: ACC_1,
    sysAcc: false,
    tenantId: TENANT_A,
    accName: "acc-1",
    role: "admin",
    roleId: ROLE_ID,
    perm: 1,
    verified: true,
    ...overrides,
  }
}

function buildProfile(overrides: Partial<Record<string, unknown>> = {}) {
  const data = ProfileSchema.parse({
    accId: ACC_1,
    isSubscription: false,
    isStaff: false,
    isManager: false,
    ownerIsActive: true,
    accountIsActive: true,
    accountWasApproved: true,
    accountWasArchived: false,
    accountWasDeleted: false,
    owners: [{ id: ACC_1, email: "user@example.com", isPrincipal: true }],
    ...overrides,
  })
  return Profile.fromValidated(data)
}

describe("Profile — schema and skeleton", () => {
  it("validates a minimal profile", () => {
    const profile = buildProfile()
    expect(profile.accId).toBe(ACC_1)
  })

  it("profileString returns profile/{accId}", () => {
    expect(buildProfile().profileString()).toBe(`profile/${ACC_1}`)
  })

  it("getOwnersIds returns owner UUIDs", () => {
    expect(buildProfile().getOwnersIds()).toEqual([ACC_1])
  })

  it("profileRedacted masks owner emails", () => {
    const redacted = buildProfile().profileRedacted()
    expect(redacted).toContain(`profile/${ACC_1}`)
    expect(redacted).not.toContain("user@example.com")
    expect(redacted).toContain("@example.com")
  })
})

describe("Profile — core fluent chain", () => {
  it("filter methods return a NEW Profile, never mutating the original", () => {
    const original = buildProfile({
      licensedResources: { records: [resource()] },
    })
    const filtered = original.onTenant(TENANT_A)
    expect(filtered).not.toBe(original)
    expect(original.data.filteringState).toBeUndefined()
  })

  it("withReadAccess filters by perm >= READ and appends integer-code filteringState", () => {
    const profile = buildProfile({
      licensedResources: {
        records: [
          resource({ perm: 0, accId: ACC_1 }),
          resource({ perm: 1, accId: ACC_2 }),
        ],
      },
    }).withReadAccess()

    expect(toLicensesAccIds(profile)).toEqual([ACC_1, ACC_2])
    expect(profile.data.filteringState).toEqual(["1:permission:0"])
  })

  it("withWriteAccess filters out READ-only resources", () => {
    const profile = buildProfile({
      licensedResources: {
        records: [
          resource({ perm: 0, accId: ACC_1 }),
          resource({ perm: 1, accId: ACC_2 }),
        ],
      },
    }).withWriteAccess()

    expect(toLicensesAccIds(profile)).toEqual([ACC_2])
    expect(profile.data.filteringState).toEqual(["1:permission:1"])
  })

  it("onTenant filters to the matching tenant and clears when empty", () => {
    const profile = buildProfile({
      licensedResources: {
        records: [
          resource({ tenantId: TENANT_A, accId: ACC_1 }),
          resource({ tenantId: TENANT_B, accId: ACC_2 }),
        ],
      },
    })

    const onA = profile.onTenant(TENANT_A)
    expect(toLicensesAccIds(onA)).toEqual([ACC_1])
    expect(onA.data.filteringState).toEqual([`1:tenantId:${TENANT_A}`])

    const onNone = profile.onTenant("00000000-0000-0000-0000-000000000000")
    expect(onNone.licensedResources).toBeUndefined()
  })

  it("withRoles filters by any-of role match", () => {
    const profile = buildProfile({
      licensedResources: {
        records: [
          resource({ role: "admin", accId: ACC_1 }),
          resource({ role: "viewer", accId: ACC_2 }),
        ],
      },
    }).withRoles(["admin"])

    expect(toLicensesAccIds(profile)).toEqual([ACC_1])
    expect(profile.data.filteringState).toEqual(["1:role:admin"])
  })

  it("onAccount filters to a single account", () => {
    const profile = buildProfile({
      licensedResources: {
        records: [
          resource({ accId: ACC_1 }),
          resource({ accId: ACC_2 }),
        ],
      },
    }).onAccount(ACC_1)

    expect(toLicensesAccIds(profile)).toEqual([ACC_1])
  })

  it("accumulates filteringState across a chained call with sequential indices", () => {
    const profile = buildProfile({
      licensedResources: {
        records: [resource({ perm: 1, tenantId: TENANT_A, role: "admin", accId: ACC_1 })],
      },
    })
      .withReadAccess()
      .onTenant(TENANT_A)
      .withRoles(["admin"])
      .onAccount(ACC_1)

    expect(profile.data.filteringState).toEqual([
      "1:permission:0",
      `2:tenantId:${TENANT_A}`,
      "3:role:admin",
      `4:accountId:${ACC_1}`,
    ])
  })

  describe("getRelatedAccountOrError priority", () => {
    it("returns HasStaffPrivileges when isStaff, regardless of licensed resources", () => {
      const profile = buildProfile({ isStaff: true })
      expect(profile.getRelatedAccountOrError()).toEqual({
        kind: "HasStaffPrivileges",
      })
    })

    it("returns HasManagerPrivileges when isManager and not staff", () => {
      const profile = buildProfile({ isManager: true })
      expect(profile.getRelatedAccountOrError()).toEqual({
        kind: "HasManagerPrivileges",
      })
    })

    it("returns AllowedAccounts when licensedResources is non-empty", () => {
      const profile = buildProfile({
        licensedResources: { records: [resource({ accId: ACC_1 })] },
      })
      expect(profile.getRelatedAccountOrError()).toEqual({
        kind: "AllowedAccounts",
        accounts: [ACC_1],
      })
    })

    it("throws InsufficientLicensesError when licensedResources is present but empty", () => {
      // Note: filtering an original non-empty licensedResources down to zero
      // matches clears licensedResources to `undefined` (verified Rust/Python
      // behavior), so this branch is only reachable when licensedResources is
      // constructed as an empty records array directly, not via a filter chain.
      const profile = buildProfile({
        licensedResources: { records: [] },
      })

      expect(() => profile.getRelatedAccountOrError()).toThrow(
        InsufficientLicensesError
      )
    })

    it("onTenant with no match clears licensedResources to undefined (not an empty array)", () => {
      const profile = buildProfile({
        licensedResources: { records: [resource({ tenantId: TENANT_A })] },
      }).onTenant(TENANT_B)

      expect(profile.licensedResources).toBeUndefined()
      expect(() => profile.getRelatedAccountOrError()).toThrow(
        InsufficientPrivilegesError
      )
    })

    it("throws InsufficientPrivilegesError when licensedResources absent entirely", () => {
      const profile = buildProfile()
      expect(() => profile.getRelatedAccountOrError()).toThrow(
        InsufficientPrivilegesError
      )
    })
  })
})

function toLicensesAccIds(profile: Profile): string[] {
  if (!profile.licensedResources) return []
  if (profile.licensedResources.kind !== "records") return []
  return profile.licensedResources.records.map((r) => r.accId)
}
