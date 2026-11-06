import { ProfileSignatureConfigurationError } from "./errors.js"
import {
  fetchProfileJwks,
  type ProfileJwksFetcher,
} from "./jwks/fetchProfileJwks.js"
import { JwksProfileSignatureVerifier } from "./jwks/jwksProfileSignatureVerifier.js"
import { parseProfileJwksUrl } from "./jwks/parseProfileJwksUrl.js"
import { ProfileKeyStore } from "./jwks/profileKeyStore.js"
import {
  DEFAULT_PROFILE_SIGNATURE_TOLERANCE_SECONDS,
  PROFILE_JWKS_ALLOW_INSECURE_HTTP_ENV,
  PROFILE_JWKS_REFETCH_COOLDOWN_SECONDS,
  PROFILE_JWKS_URL_ENV,
  PROFILE_SIGNATURE_AUDIENCE_ENV,
  PROFILE_SIGNATURE_TOLERANCE_ENV,
} from "./settings.js"

const CANONICAL_POSITIVE_INTEGER = /^[1-9][0-9]*$/

export type EnvironmentSource = Readonly<Record<string, string | undefined>>

function parseTolerance(env: EnvironmentSource): number {
  const raw = env[PROFILE_SIGNATURE_TOLERANCE_ENV]
  if (raw === undefined) return DEFAULT_PROFILE_SIGNATURE_TOLERANCE_SECONDS

  const trimmed = raw.trim()
  const value = Number(trimmed)
  if (!CANONICAL_POSITIVE_INTEGER.test(trimmed) || !Number.isSafeInteger(value)) {
    throw new ProfileSignatureConfigurationError(
      `${PROFILE_SIGNATURE_TOLERANCE_ENV} must be a positive integer`
    )
  }

  return value
}

function parseAudience(env: EnvironmentSource): string | undefined {
  const raw = env[PROFILE_SIGNATURE_AUDIENCE_ENV]
  if (raw === undefined) return undefined

  if (raw.trim() === "") {
    throw new ProfileSignatureConfigurationError(
      `${PROFILE_SIGNATURE_AUDIENCE_ENV} must not be empty`
    )
  }

  return raw
}

function parseInsecureSwitch(env: EnvironmentSource): boolean {
  const raw = env[PROFILE_JWKS_ALLOW_INSECURE_HTTP_ENV]?.trim()
  if (raw === undefined || raw === "false") return false
  if (raw === "true") return true

  throw new ProfileSignatureConfigurationError(
    `${PROFILE_JWKS_ALLOW_INSECURE_HTTP_ENV} must be true or false`
  )
}

/**
 * Build the verifier from an environment snapshot (default `process.env`).
 *
 * Returns `undefined` when `MYCELIUM_JWKS_URL` is absent (verification
 * disabled, legacy behavior). With the URL set, `MYC_PROFILE_SIGNATURE_AUDIENCE`
 * is required. Every present setting is validated even when disabled; an
 * invalid one throws `ProfileSignatureConfigurationError`, never "disabled".
 *
 * Synchronous and network-free: the keys are fetched on first use. Prefer
 * `prepareProfileSignatureVerifier()` at startup to download them before
 * serving.
 */
export function loadProfileSignatureVerifierFromEnv(
  env: EnvironmentSource = process.env,
  fetcher: ProfileJwksFetcher = fetchProfileJwks
): JwksProfileSignatureVerifier | undefined {
  const toleranceSeconds = parseTolerance(env)
  const audience = parseAudience(env)
  const allowInsecureHttp = parseInsecureSwitch(env)

  const rawUrl = env[PROFILE_JWKS_URL_ENV]
  if (rawUrl === undefined) return undefined

  const url = parseProfileJwksUrl(rawUrl, allowInsecureHttp)
  if (audience === undefined) {
    throw new ProfileSignatureConfigurationError(
      `${PROFILE_SIGNATURE_AUDIENCE_ENV} is required when ${PROFILE_JWKS_URL_ENV} is set`
    )
  }

  const store = new ProfileKeyStore(
    url,
    fetcher,
    PROFILE_JWKS_REFETCH_COOLDOWN_SECONDS
  )
  return new JwksProfileSignatureVerifier(store, toleranceSeconds, audience)
}

/**
 * Opt-in: read the settings and download the gateway JWKS before serving.
 *
 * Rejects on invalid settings or when the keys cannot be fetched. Without
 * it, the Express and Fastify integrations download the keys on the first
 * signed request, so the service does not depend on the gateway to start.
 * Resolves `undefined` when verification is disabled.
 */
export async function prepareProfileSignatureVerifier(
  env: EnvironmentSource = process.env,
  fetcher: ProfileJwksFetcher = fetchProfileJwks
): Promise<JwksProfileSignatureVerifier | undefined> {
  const verifier = loadProfileSignatureVerifierFromEnv(env, fetcher)
  await verifier?.prefetch()
  return verifier
}
