export const DEFAULT_PROFILE_KEY = "x-mycelium-profile"
export const DEFAULT_EMAIL_KEY = "x-mycelium-email"
export const DEFAULT_SCOPE_KEY = "x-mycelium-scope"
export const DEFAULT_MYCELIUM_ROLE_KEY = "x-mycelium-role"
export const DEFAULT_REQUEST_ID_KEY = "x-mycelium-request-id"
export const DEFAULT_CONNECTION_STRING_KEY = "x-mycelium-connection-string"
export const DEFAULT_TENANT_ID_KEY = "x-mycelium-tenant-id"
export const DEFAULT_PROFILE_SIGNATURE_KEY = "x-mycelium-profile-signature"
/** URL of the gateway profile JWKS; its presence enables verification. */
export const PROFILE_JWKS_URL_ENV = "MYCELIUM_JWKS_URL"
/** Development-only switch accepting an `http://` JWKS URL ("true"/"false"). */
export const PROFILE_JWKS_ALLOW_INSECURE_HTTP_ENV =
  "MYCELIUM_JWKS_ALLOW_INSECURE_HTTP"
/** Path where the gateway publishes the profile JWKS. */
export const PROFILE_JWKS_PATH = "/.well-known/mycelium-profile-jwks.json"
export const PROFILE_JWKS_FETCH_TIMEOUT_SECONDS = 5
export const PROFILE_JWKS_MAX_BYTES = 64 * 1024
/** Minimum interval between JWKS requests (unknown `kid`, failed refresh). */
export const PROFILE_JWKS_REFETCH_COOLDOWN_SECONDS = 30
/** Shorter retry interval while no key set was ever downloaded (first use). */
export const PROFILE_JWKS_EMPTY_RETRY_SECONDS = 5
export const PROFILE_JWKS_DEFAULT_MAX_AGE_SECONDS = 43_200
export const PROFILE_JWKS_MIN_MAX_AGE_SECONDS = 60
export const PROFILE_JWKS_MAX_MAX_AGE_SECONDS = 86_400
export const PROFILE_SIGNATURE_TOLERANCE_ENV =
  "MYC_PROFILE_SIGNATURE_TOLERANCE_SECONDS"
export const PROFILE_SIGNATURE_AUDIENCE_ENV = "MYC_PROFILE_SIGNATURE_AUDIENCE"
export const DEFAULT_PROFILE_SIGNATURE_TOLERANCE_SECONDS = 60
export const MAX_PROFILE_SIGNATURE_BYTES = 4096
