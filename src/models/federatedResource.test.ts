import { describe, expect, it } from "vitest"
import { InsufficientPrivilegesError } from "../errors.js"
import { decodeAndDecompressProfileFromBase64 } from "../functions/decodeAndDecompressProfileFromBase64.js"
import { vectorNamed } from "../testdata/profileSignatureContract.js"
import { FederatedResourceSchema, toGrant } from "./federatedResource.js"
import { toLicensesVector } from "./licensedResources.js"
import { Profile, ProfileSchema } from "./profile.js"

const ACC_ID = "d3c37c4a-8d3a-4d3a-9d3a-8d3a4d3a9d3a"
const ROLE_ID = "f5e59e6a-0f5a-4f5a-9f5a-0f5a4f5a9f5a"
const LOCAL_TENANT = "b6a1e6c2-6b1a-4b1a-9b1a-6b1a4b1a9b1a"
const PEER_TENANT = "c2b26c3a-7c2a-4c2a-8c2a-7c2a4c2a8c2a"
const ISSUER_1 = "11111111-1111-4111-8111-111111111111"
const ISSUER_2 = "22222222-2222-4222-8222-222222222222"

function grant(overrides: Record<string, unknown> = {}) {
  return {
    accId: ACC_ID,
    sysAcc: false,
    tenantId: LOCAL_TENANT,
    accName: "account-01",
    role: "reader",
    roleId: ROLE_ID,
    perm: "read",
    verified: true,
    ...overrides,
  }
}

function buildProfile(overrides: Record<string, unknown> = {}): Profile {
  return Profile.fromValidated(
    ProfileSchema.parse({
      accId: ACC_ID,
      isSubscription: false,
      isStaff: false,
      isManager: false,
      ownerIsActive: true,
      accountIsActive: true,
      accountWasApproved: true,
      accountWasArchived: false,
      accountWasDeleted: false,
      owners: [{ id: ACC_ID, email: "user@example.com", isPrincipal: true }],
      licensedResources: { records: [grant()] },
      federatedResources: [
        grant({ issuer: ISSUER_1, tenantId: PEER_TENANT, role: "peer-role" }),
        grant({ issuer: ISSUER_2, tenantId: PEER_TENANT, role: "peer-role" }),
      ],
      ...overrides,
    })
  )
}

function roles(profile: Profile): string[] {
  return toLicensesVector(profile.licensedResources).map((r) => r.role)
}

describe("FederatedResourceSchema", () => {
  it("parses a licensed resource with its issuer", () => {
    const parsed = FederatedResourceSchema.parse(grant({ issuer: ISSUER_1 }))
    expect(parsed.issuer).toBe(ISSUER_1)
    expect(parsed.role).toBe("reader")
    expect(toGrant(parsed)).not.toHaveProperty("issuer")
  })

  it("rejects a grant without an issuer", () => {
    expect(() => FederatedResourceSchema.parse(grant())).toThrow()
  })

  it("rejects a non-uuid issuer", () => {
    expect(() =>
      FederatedResourceSchema.parse(grant({ issuer: "service-01" }))
    ).toThrow()
  })

  it("is optional on the profile", () => {
    const profile = buildProfile({ federatedResources: undefined })
    expect(profile.federatedResources).toBeUndefined()
  })
})

describe("Profile federated grants", () => {
  it("default chain ignores federated grants", () => {
    const profile = buildProfile()
    expect(roles(profile.withRoles(["peer-role"]))).toEqual([])
    expect(roles(profile.onTenant(PEER_TENANT))).toEqual([])
    expect(roles(profile.withReadAccess())).toEqual(["reader"])
  })

  it("withFederated adds every issuer's grants to the local ones", () => {
    const profile = buildProfile().withFederated()
    expect(roles(profile)).toEqual(["reader", "peer-role", "peer-role"])
    expect(roles(profile.withRoles(["peer-role"]))).toHaveLength(2)
    expect(profile.filteringState).toEqual(["1:withFederated:true"])
  })

  it("withFederated without any grant yields no licensed resources", () => {
    const profile = buildProfile({
      licensedResources: undefined,
      federatedResources: undefined,
    }).withFederated()
    expect(profile.licensedResources).toBeUndefined()
  })

  it("fromIssuer keeps only that issuer's grants", () => {
    const profile = buildProfile({
      federatedResources: [
        grant({ issuer: ISSUER_1, role: "peer-role-01" }),
        grant({ issuer: ISSUER_2, role: "peer-role-02" }),
      ],
    }).fromIssuer(ISSUER_1)
    expect(roles(profile)).toEqual(["peer-role-01"])
    expect(profile.filteringState).toEqual([`1:issuer:${ISSUER_1}`])
  })

  it("fromIssuer with an unknown issuer yields no licensed resources", () => {
    const profile = buildProfile().fromIssuer(
      "33333333-3333-4333-8333-333333333333"
    )
    expect(profile.licensedResources).toBeUndefined()
    expect(() => profile.getIdsOrError()).toThrow(InsufficientPrivilegesError)
  })
})

describe("gateway vector valid_with_federated_resources", () => {
  const ISSUER = "77777777-7777-4777-8777-777777777777"
  const profile = decodeAndDecompressProfileFromBase64(
    vectorNamed("valid_with_federated_resources").profileHeader
  )

  it("carries the federated grant with its issuer", () => {
    expect(profile.federatedResources).toHaveLength(1)
    expect(profile.federatedResources?.[0]?.issuer).toBe(ISSUER)
    expect(profile.federatedResources?.[0]?.role).toBe("federated-role")
  })

  it("is invisible to the default chain", () => {
    expect(
      profile.withRoles(["federated-role"]).licensedResources
    ).toBeUndefined()
  })

  it("is found after withFederated", () => {
    expect(
      roles(profile.withFederated().withRoles(["federated-role"]))
    ).toEqual(["federated-role"])
  })

  it("fromIssuer keeps it and drops the local grant", () => {
    expect(roles(profile)).toEqual(["local-role"])
    const narrowed = profile.fromIssuer(ISSUER)
    expect(roles(narrowed)).toEqual(["federated-role"])
    expect(roles(narrowed.withRoles(["federated-role"]))).toEqual([
      "federated-role",
    ])
  })
})
