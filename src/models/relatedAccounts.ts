export type RelatedAccounts =
  | { kind: "AllowedAccounts"; accounts: string[] }
  | { kind: "HasTenantWidePrivileges"; tenantId: string }
  | { kind: "HasStaffPrivileges" }
  | { kind: "HasManagerPrivileges" }
