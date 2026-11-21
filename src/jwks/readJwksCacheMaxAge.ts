import {
  PROFILE_JWKS_DEFAULT_MAX_AGE_SECONDS,
  PROFILE_JWKS_MAX_MAX_AGE_SECONDS,
  PROFILE_JWKS_MIN_MAX_AGE_SECONDS,
} from "../settings.js"

// Same grammar as Rust `u64::from_str`: optional "+", decimal digits.
const UNSIGNED_INTEGER = /^\+?[0-9]+$/
const U64_MAX = 18_446_744_073_709_551_615n

function readMaxAgeDirective(directive: string): number | undefined {
  const separator = directive.indexOf("=")
  if (separator < 0) return undefined

  const name = directive.slice(0, separator).trim().toLowerCase()
  const value = directive.slice(separator + 1).trim()
  if (name !== "max-age" || !UNSIGNED_INTEGER.test(value)) return undefined

  const seconds = BigInt(value)
  if (seconds > U64_MAX) return undefined
  return seconds > BigInt(PROFILE_JWKS_MAX_MAX_AGE_SECONDS)
    ? PROFILE_JWKS_MAX_MAX_AGE_SECONDS
    : Number(seconds)
}

/**
 * How long a fetched profile JWKS may be cached, in seconds.
 *
 * Reads the `max-age` directive of a `Cache-Control` value and clamps it to
 * 60..86400; 43200 (12 h) when the header or directive is absent or
 * unreadable. Same rule as the gateway and every SDK (`jwks-vectors.json`).
 */
export function readJwksCacheMaxAge(
  cacheControl: string | null | undefined
): number {
  let announced: number | undefined
  for (const directive of (cacheControl ?? "").split(",")) {
    announced = readMaxAgeDirective(directive)
    if (announced !== undefined) break
  }

  const seconds = announced ?? PROFILE_JWKS_DEFAULT_MAX_AGE_SECONDS
  return Math.min(
    Math.max(seconds, PROFILE_JWKS_MIN_MAX_AGE_SECONDS),
    PROFILE_JWKS_MAX_MAX_AGE_SECONDS
  )
}
