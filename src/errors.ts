export class MyceliumError extends Error {
  code?: string
  expTrue: boolean

  constructor(message: string, code?: string, expTrue = false) {
    super(message)
    this.name = "MyceliumError"
    this.code = code
    this.expTrue = expTrue
  }
}

export class InsufficientPrivilegesError extends MyceliumError {
  filteringState: string[]

  constructor(message: string, filteringState: string[] = []) {
    super(message, "MYC00019", true)
    this.name = "InsufficientPrivilegesError"
    this.filteringState = filteringState
  }
}

export class InsufficientLicensesError extends MyceliumError {
  constructor(
    message: string = "Insufficient licenses to perform these action"
  ) {
    super(message, "MYC00019", true)
    this.name = "InsufficientLicensesError"
  }
}

export class ProfileDecodingError extends MyceliumError {
  constructor(message: string) {
    super(message, "MYC00020", false)
    this.name = "ProfileDecodingError"
  }
}

export const PROFILE_SIGNATURE_INVALID_CODE = "MYC_PROFILE_SIGNATURE_INVALID"
export const PROFILE_SIGNATURE_CONFIG_INVALID_CODE =
  "MYC_PROFILE_SIGNATURE_CONFIG_INVALID"

export type ProfileSignatureRejectionReason =
  | "missing_profile"
  | "missing_signature"
  | "duplicate_header"
  | "malformed_signature"
  | "unsupported_algorithm"
  | "unknown_key"
  | "invalid_signature"
  | "invalid_claims"
  | "timestamp_out_of_tolerance"
  | "profile_hash_mismatch"
  | "audience_mismatch"
  | "invalid_profile"

/**
 * Invalid verification configuration. Any `MYC_PROFILE_PUBLIC_KEY_*` means
 * "verification requested": a malformed entry must stop the service instead
 * of silently disabling verification. Messages name variables, never values.
 */
export class ProfileSignatureConfigurationError extends MyceliumError {
  constructor(message: string) {
    super(message, PROFILE_SIGNATURE_CONFIG_INVALID_CODE, false)
    this.name = "ProfileSignatureConfigurationError"
  }
}

/**
 * Signature rejected. `reason` is stable and log-safe; HTTP integrations
 * answer with a generic message and never expose it to clients.
 */
export class ProfileSignatureError extends MyceliumError {
  readonly reason: ProfileSignatureRejectionReason

  constructor(reason: ProfileSignatureRejectionReason) {
    super(`Profile signature rejected: ${reason}`, PROFILE_SIGNATURE_INVALID_CODE, true)
    this.name = "ProfileSignatureError"
    this.reason = reason
  }
}
