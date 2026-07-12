import { describe, expect, it } from "vitest"
import { InsufficientPrivilegesError } from "../errors.js"
import { Permission } from "./permission.js"
import { Profile, ProfileSchema } from "./profile.js"

const TENANT_A = "b6a1e6c2-6b1a-4b1a-9b1a-6b1a4b1a9b1a"
const TENANT_B = "c2b26c3a-7c2a-4c2a-8c2a-7c2a4c2a8c2a"
const ACC_1 = "d3c37c4a-8d3a-4d3a-9d3a-8d3a4d3a9d3a"
const ACC_2 = "e4d48d5a-9e4a-4e4a-8e4a-9e4a4e4a8e4a"
const ROLE_ID = "f5e59e6a-0f5a-4f5a-9f5a-0f5a4f5a9f5a"
const MANAGER_ROLE_ID = "05e69e6a-1f5a-4f5a-9f5a-1f5a4f5a9f5a"

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

function accIds(profile: Profile): string[] {
  if (!profile.licensedResources) return []
  if (profile.licensedResources.kind !== "records") return []
  return profile.licensedResources.records.map((r) => r.accId)
}

describe("hasPermitFlags / hasNotDenyFlags", () => {
  it("hasPermitFlags requires ALL given flags present; drops resources with no permitFlags", () => {
    const profile = buildProfile({
      licensedResources: {
        records: [
          resource({ accId: ACC_1, permitFlags: ["a", "b"] }),
          resource({ accId: ACC_2 }), // no permitFlags at all
        ],
      },
    }).hasPermitFlags(["a", "b"])

    expect(accIds(profile)).toEqual([ACC_1])
  })

  it("hasPermitFlags drops a resource missing even one requested flag", () => {
    const profile = buildProfile({
      licensedResources: {
        records: [resource({ accId: ACC_1, permitFlags: ["a"] })],
      },
    }).hasPermitFlags(["a", "b"])

    expect(profile.licensedResources).toBeUndefined()
  })

  it("hasNotDenyFlags keeps resources with no denyFlags at all (permissive default)", () => {
    const profile = buildProfile({
      licensedResources: {
        records: [resource({ accId: ACC_1 })], // no denyFlags
      },
    }).hasNotDenyFlags(["x"])

    expect(accIds(profile)).toEqual([ACC_1])
  })

  it("hasNotDenyFlags drops a resource whose denyFlags include a requested flag", () => {
    const profile = buildProfile({
      licensedResources: {
        records: [
          resource({ accId: ACC_1, denyFlags: ["x"] }),
          resource({ accId: ACC_2, denyFlags: ["y"] }),
        ],
      },
    }).hasNotDenyFlags(["x"])

    expect(accIds(profile)).toEqual([ACC_2])
  })
})

describe("onTenantAsManager / withSystemAccountsAccess", () => {
  it("onTenantAsManager filters by tenant + permission + the literal 'tenant-manager' role", () => {
    const profile = buildProfile({
      licensedResources: {
        records: [
          resource({
            accId: ACC_1,
            tenantId: TENANT_A,
            role: "tenant-manager",
            roleId: MANAGER_ROLE_ID,
            perm: 1,
          }),
          resource({ accId: ACC_2, tenantId: TENANT_A, role: "admin" }),
        ],
      },
    }).onTenantAsManager(TENANT_A, Permission.WRITE)

    expect(accIds(profile)).toEqual([ACC_1])
    expect(profile.data.filteringState).toContain("4:isTenantManager:true")
  })

  it("withSystemAccountsAccess filters to sysAcc === true only", () => {
    const profile = buildProfile({
      licensedResources: {
        records: [
          resource({ accId: ACC_1, sysAcc: true }),
          resource({ accId: ACC_2, sysAcc: false }),
        ],
      },
    }).withSystemAccountsAccess()

    expect(accIds(profile)).toEqual([ACC_1])
  })
})

describe("withTenantOwnershipOrError / getIdsOrError / hasAdminPrivileges", () => {
  it("withTenantOwnershipOrError succeeds on an exact tenant match", () => {
    const profile = buildProfile({
      tenantsOwnership: {
        records: [{ id: TENANT_A, name: "Acme", since: "2026-07-12T10:00:00+00:00" }],
      },
    }).withTenantOwnershipOrError(TENANT_A)

    expect(profile.data.filteringState).toContain(`1:tenantOwnership:${TENANT_A}`)
  })

  it("withTenantOwnershipOrError throws when there is no matching tenant", () => {
    const profile = buildProfile({
      tenantsOwnership: {
        records: [{ id: TENANT_A, name: "Acme", since: "2026-07-12T10:00:00+00:00" }],
      },
    })

    expect(() => profile.withTenantOwnershipOrError(TENANT_B)).toThrow(
      InsufficientPrivilegesError
    )
  })

  it("hasAdminPrivileges returns isStaff || isManager exactly", () => {
    expect(buildProfile({ isStaff: true }).hasAdminPrivileges()).toBe(true)
    expect(buildProfile({ isManager: true }).hasAdminPrivileges()).toBe(true)
    expect(buildProfile().hasAdminPrivileges()).toBe(false)
  })

  it("hasAdminPrivilegesOrError throws when neither staff nor manager", () => {
    expect(() => buildProfile().hasAdminPrivilegesOrError()).toThrow(
      InsufficientPrivilegesError
    )
    expect(() =>
      buildProfile({ isStaff: true }).hasAdminPrivilegesOrError()
    ).not.toThrow()
  })

  it("getIdsOrError succeeds with an empty array for an admin with zero licensed resources", () => {
    const profile = buildProfile({ isStaff: true })
    expect(profile.getIdsOrError()).toEqual([])
  })

  it("getIdsOrError throws for a non-admin with zero licensed resources", () => {
    const profile = buildProfile()
    expect(() => profile.getIdsOrError()).toThrow(InsufficientPrivilegesError)
  })

  it("getIdsOrError returns the accId list when licensed resources are present", () => {
    const profile = buildProfile({
      licensedResources: { records: [resource({ accId: ACC_1 })] },
    })
    expect(profile.getIdsOrError()).toEqual([ACC_1])
  })
})

describe("getTenantWidePermissionOrError / getRelatedAccountsOrTenantWidePermissionOrError", () => {
  it("returns HasStaffPrivileges when isStaff", () => {
    const profile = buildProfile({ isStaff: true })
    expect(
      profile.getTenantWidePermissionOrError(TENANT_A, Permission.READ)
    ).toEqual({ kind: "HasStaffPrivileges" })
  })

  it("returns HasManagerPrivileges when isManager and not staff", () => {
    const profile = buildProfile({ isManager: true })
    expect(
      profile.getTenantWidePermissionOrError(TENANT_A, Permission.READ)
    ).toEqual({ kind: "HasManagerPrivileges" })
  })

  it("returns HasTenantWidePrivileges on an exact tenantsOwnership match", () => {
    const profile = buildProfile({
      tenantsOwnership: {
        records: [{ id: TENANT_A, name: "Acme", since: "2026-07-12T10:00:00+00:00" }],
      },
    })
    expect(
      profile.getTenantWidePermissionOrError(TENANT_A, Permission.READ)
    ).toEqual({ kind: "HasTenantWidePrivileges", tenantId: TENANT_A })
  })

  it("returns HasTenantWidePrivileges via the tenant-manager-role fallback", () => {
    const profile = buildProfile({
      licensedResources: {
        records: [
          resource({
            tenantId: TENANT_A,
            role: "tenant-manager",
            perm: 1,
          }),
        ],
      },
    })
    expect(
      profile.getTenantWidePermissionOrError(TENANT_A, Permission.WRITE)
    ).toEqual({ kind: "HasTenantWidePrivileges", tenantId: TENANT_A })
  })

  it("throws InsufficientPrivilegesError when none of the 4 branches match", () => {
    const profile = buildProfile()
    expect(() =>
      profile.getTenantWidePermissionOrError(TENANT_A, Permission.READ)
    ).toThrow(InsufficientPrivilegesError)
  })

  it("getRelatedAccountOrError NEVER produces HasTenantWidePrivileges (regression guard)", () => {
    const profile = buildProfile({
      tenantsOwnership: {
        records: [{ id: TENANT_A, name: "Acme", since: "2026-07-12T10:00:00+00:00" }],
      },
      licensedResources: { records: [resource({ accId: ACC_1 })] },
    })
    const result = profile.getRelatedAccountOrError()
    expect(result.kind).not.toBe("HasTenantWidePrivileges")
    expect(result).toEqual({ kind: "AllowedAccounts", accounts: [ACC_1] })
  })

  it("getRelatedAccountsOrTenantWidePermissionOrError tries tenant-wide first, falls back to related-account", () => {
    const profile = buildProfile({
      licensedResources: { records: [resource({ accId: ACC_1 })] },
    })
    // No tenant-wide privileges available -> falls back to getRelatedAccountOrError
    expect(
      profile.getRelatedAccountsOrTenantWidePermissionOrError(
        TENANT_A,
        Permission.READ
      )
    ).toEqual({ kind: "AllowedAccounts", accounts: [ACC_1] })
  })
})
