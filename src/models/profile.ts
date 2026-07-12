import { z } from "zod"
import {
  InsufficientLicensesError,
  InsufficientPrivilegesError,
} from "../errors.js"
import { ProfileMetaSchema } from "./accountMetaKey.js"
import type { LicensedResource } from "./licensedResource.js"
import {
  LicensedResourcesSchema,
  toLicensesVector,
  type LicensedResources,
} from "./licensedResources.js"
import { OwnerSchema } from "./owner.js"
import { Permission, permissionToInt } from "./permission.js"
import type { RelatedAccounts } from "./relatedAccounts.js"
import {
  TenantsOwnershipSchema,
  toOwnershipVector,
} from "./tenantsOwnership.js"
import { VerboseStatusSchema } from "./verboseStatus.js"

export const ProfileSchema = z.object({
  owners: z.array(OwnerSchema).default([]),
  accId: z.string().uuid(),
  isSubscription: z.boolean(),
  isStaff: z.boolean(),
  isManager: z.boolean().default(false),
  ownerIsActive: z.boolean(),
  accountIsActive: z.boolean(),
  accountWasApproved: z.boolean(),
  accountWasArchived: z.boolean(),
  accountWasDeleted: z.boolean(),
  verboseStatus: VerboseStatusSchema.optional(),
  licensedResources: LicensedResourcesSchema.optional(),
  tenantsOwnership: TenantsOwnershipSchema.optional(),
  meta: ProfileMetaSchema.optional(),
  filteringState: z.array(z.string()).optional(),
})

export type ProfileData = z.infer<typeof ProfileSchema>

function appendState(
  current: string[] | undefined,
  entry: string
): string[] {
  const state = current ?? []
  return [...state, `${state.length + 1}:${entry}`]
}

export class Profile {
  readonly data: ProfileData

  private constructor(data: ProfileData) {
    this.data = data
  }

  static fromValidated(data: ProfileData): Profile {
    return new Profile(data)
  }

  get accId(): string {
    return this.data.accId
  }

  get owners() {
    return this.data.owners
  }

  get isStaff(): boolean {
    return this.data.isStaff
  }

  get isManager(): boolean {
    return this.data.isManager
  }

  get licensedResources(): LicensedResources | undefined {
    return this.data.licensedResources
  }

  get tenantsOwnership() {
    return this.data.tenantsOwnership
  }

  get filteringState(): string[] | undefined {
    return this.data.filteringState
  }

  private withData(partial: Partial<ProfileData>): Profile {
    return new Profile({ ...this.data, ...partial })
  }

  private filterLicensedResources(
    predicate: (r: LicensedResource) => boolean
  ): LicensedResources | undefined {
    const records = toLicensesVector(this.data.licensedResources).filter(
      predicate
    )
    return records.length === 0
      ? undefined
      : { kind: "records", records }
  }

  private withPermission(permission: Permission): Profile {
    if (!this.data.licensedResources) return this
    const licensedResources = this.filterLicensedResources(
      (r) => permissionToInt(r.perm) >= permissionToInt(permission)
    )
    return this.withData({
      licensedResources,
      filteringState: appendState(
        this.data.filteringState,
        `permission:${permissionToInt(permission)}`
      ),
    })
  }

  withReadAccess(): Profile {
    return this.withPermission(Permission.READ)
  }

  withWriteAccess(): Profile {
    return this.withPermission(Permission.WRITE)
  }

  onTenant(tenantId: string): Profile {
    const licensedResources = this.filterLicensedResources(
      (r) => r.tenantId === tenantId
    )
    return this.withData({
      licensedResources,
      filteringState: appendState(
        this.data.filteringState,
        `tenantId:${tenantId}`
      ),
    })
  }

  withRoles(roles: string[]): Profile {
    const licensedResources = this.filterLicensedResources((r) =>
      roles.includes(r.role)
    )
    return this.withData({
      licensedResources,
      filteringState: appendState(
        this.data.filteringState,
        `role:${roles.join(",")}`
      ),
    })
  }

  onAccount(accountId: string): Profile {
    const licensedResources = this.filterLicensedResources(
      (r) => r.accId === accountId
    )
    return this.withData({
      licensedResources,
      filteringState: appendState(
        this.data.filteringState,
        `accountId:${accountId}`
      ),
    })
  }

  hasPermitFlags(flags: string[]): Profile {
    const licensedResources = this.filterLicensedResources((r) => {
      if (!r.permitFlags) return false
      return flags.every((f) => r.permitFlags?.includes(f))
    })
    return this.withData({
      licensedResources,
      filteringState: appendState(
        this.data.filteringState,
        `permittedFlags:${flags.join(",")}`
      ),
    })
  }

  hasNotDenyFlags(flags: string[]): Profile {
    const licensedResources = this.filterLicensedResources((r) => {
      if (!r.denyFlags) return true
      return !flags.some((f) => r.denyFlags?.includes(f))
    })
    return this.withData({
      licensedResources,
      filteringState: appendState(
        this.data.filteringState,
        `deniedFlags:${flags.join(",")}`
      ),
    })
  }

  onTenantAsManager(tenantId: string, permission: Permission): Profile {
    const profile = this.onTenant(tenantId)
      .withPermission(permission)
      .withRoles(["tenant-manager"])

    return profile.withData({
      filteringState: appendState(profile.data.filteringState, `isTenantManager:true`),
    })
  }

  withSystemAccountsAccess(): Profile {
    const licensedResources = this.filterLicensedResources((r) => r.sysAcc)
    return this.withData({
      licensedResources,
      filteringState: appendState(
        this.data.filteringState,
        `isAccStd:true`
      ),
    })
  }

  withTenantOwnershipOrError(tenantId: string): Profile {
    const tenants = toOwnershipVector(this.data.tenantsOwnership)
    if (tenants.some((t) => t.id === tenantId)) {
      return this.withData({
        filteringState: appendState(
          this.data.filteringState,
          `tenantOwnership:${tenantId}`
        ),
      })
    }

    throw new InsufficientPrivilegesError(
      `Insufficient privileges to perform these action (no tenant ownership): ${(
        this.data.filteringState ?? []
      ).join(", ")}`,
      this.data.filteringState
    )
  }

  hasAdminPrivileges(): boolean {
    return this.data.isStaff || this.data.isManager
  }

  hasAdminPrivilegesOrError(): void {
    if (!this.hasAdminPrivileges()) {
      throw new InsufficientPrivilegesError(
        "Current account has no administration privileges",
        this.data.filteringState
      )
    }
  }

  getIdsOrError(): string[] {
    const ids = toLicensesVector(this.data.licensedResources).map(
      (r) => r.accId
    )

    if (ids.length === 0 && !this.hasAdminPrivileges()) {
      throw new InsufficientPrivilegesError(
        `Insufficient privileges to perform these action (no ids): ${(
          this.data.filteringState ?? []
        ).join(", ")}`,
        this.data.filteringState
      )
    }

    return ids
  }

  getTenantWidePermissionOrError(
    tenantId: string,
    permission: Permission
  ): RelatedAccounts {
    if (this.data.isStaff) {
      return { kind: "HasStaffPrivileges" }
    }
    if (this.data.isManager) {
      return { kind: "HasManagerPrivileges" }
    }

    const tenants = toOwnershipVector(this.data.tenantsOwnership)
    if (tenants.some((t) => t.id === tenantId)) {
      return { kind: "HasTenantWidePrivileges", tenantId }
    }

    try {
      this.onTenantAsManager(tenantId, permission).getIdsOrError()
      return { kind: "HasTenantWidePrivileges", tenantId }
    } catch {
      // fall through to error below
    }

    throw new InsufficientPrivilegesError(
      `Insufficient privileges to perform these action (no tenant wide permission): ${(
        this.data.filteringState ?? []
      ).join(", ")}`,
      this.data.filteringState
    )
  }

  getRelatedAccountsOrTenantWidePermissionOrError(
    tenantId: string,
    permission: Permission
  ): RelatedAccounts {
    try {
      return this.getTenantWidePermissionOrError(tenantId, permission)
    } catch {
      return this.getRelatedAccountOrError()
    }
  }

  getRelatedAccountOrError(): RelatedAccounts {
    if (this.data.isStaff) {
      return { kind: "HasStaffPrivileges" }
    }
    if (this.data.isManager) {
      return { kind: "HasManagerPrivileges" }
    }
    if (this.data.licensedResources) {
      const records = toLicensesVector(this.data.licensedResources)
      if (records.length === 0) {
        throw new InsufficientLicensesError()
      }
      return {
        kind: "AllowedAccounts",
        accounts: records.map((r) => r.accId),
      }
    }

    throw new InsufficientPrivilegesError(
      `Insufficient privileges to perform these action (no accounts): ${(
        this.data.filteringState ?? []
      ).join(", ")}`,
      this.data.filteringState
    )
  }

  getOwnersIds(): string[] {
    return this.data.owners.map((o) => o.id)
  }

  profileString(): string {
    return `profile/${this.data.accId}`
  }

  profileRedacted(): string {
    const redactedEmails = this.data.owners.map((o) => redactEmail(o.email))
    return `profile/${this.data.accId} owners: [${redactedEmails.join(", ")}]`
  }
}

function redactEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!domain || !local) return email
  const visible = local.slice(0, 1)
  return `${visible}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`
}
