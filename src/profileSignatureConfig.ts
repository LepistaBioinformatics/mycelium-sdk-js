import { createPublicKey, type KeyObject } from "node:crypto"
import { ProfileSignatureConfigurationError } from "./errors.js"
import {
  DEFAULT_PROFILE_SIGNATURE_TOLERANCE_SECONDS,
  PROFILE_PUBLIC_KEY_ENV_PREFIX,
  PROFILE_SIGNATURE_AUDIENCE_ENV,
  PROFILE_SIGNATURE_TOLERANCE_ENV,
} from "./settings.js"

const CANONICAL_POSITIVE_INTEGER = /^[1-9][0-9]*$/
const MAX_KEY_VERSION = 4_294_967_295

export type EnvironmentSource = Readonly<Record<string, string | undefined>>

/**
 * Immutable verification settings: trusted Ed25519 keys by `kid`.
 *
 * The key map is private; callers can only look keys up.
 */
export class ProfileSignatureVerifier {
  readonly #keys: ReadonlyMap<string, KeyObject>
  readonly toleranceSeconds: number
  readonly expectedAudience: string | undefined

  constructor(
    keys: ReadonlyMap<string, KeyObject>,
    toleranceSeconds: number,
    expectedAudience?: string
  ) {
    this.#keys = new Map(keys)
    this.toleranceSeconds = toleranceSeconds
    this.expectedAudience = expectedAudience
    Object.freeze(this)
  }

  keyFor(kid: string): KeyObject | undefined {
    return this.#keys.get(kid)
  }

  get keyVersions(): string[] {
    return [...this.#keys.keys()].sort()
  }
}

export function isCanonicalKeyVersion(raw: string): boolean {
  return CANONICAL_POSITIVE_INTEGER.test(raw) && Number(raw) <= MAX_KEY_VERSION
}

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

function importPublicKey(name: string, pem: string | undefined): KeyObject {
  if (pem === undefined || pem.trim() === "") {
    throw new ProfileSignatureConfigurationError(`${name} is empty`)
  }

  let keyObject: KeyObject
  try {
    keyObject = createPublicKey({ key: pem, format: "pem" })
  } catch {
    throw new ProfileSignatureConfigurationError(
      `${name} is not a PEM SubjectPublicKeyInfo public key`
    )
  }

  // createPublicKey derives a public key from a private PEM: reject that, the
  // consumer must never hold the gateway's private key.
  if (pem.includes("PRIVATE KEY")) {
    throw new ProfileSignatureConfigurationError(
      `${name} contains a private key; configure the public key only`
    )
  }

  if (keyObject.asymmetricKeyType !== "ed25519") {
    throw new ProfileSignatureConfigurationError(
      `${name} is not an Ed25519 public key`
    )
  }

  return keyObject
}

function loadPublicKeys(env: EnvironmentSource): Map<string, KeyObject> {
  const keys = new Map<string, KeyObject>()
  const names = Object.keys(env)
    .filter((name) => name.startsWith(PROFILE_PUBLIC_KEY_ENV_PREFIX))
    .sort()

  for (const name of names) {
    const version = name.slice(PROFILE_PUBLIC_KEY_ENV_PREFIX.length)
    if (!isCanonicalKeyVersion(version)) {
      throw new ProfileSignatureConfigurationError(
        `${name}: key version suffix must be a canonical positive integer (for example MYC_PROFILE_PUBLIC_KEY_1)`
      )
    }

    keys.set(version, importPublicKey(name, env[name]))
  }

  return keys
}

/**
 * Build the verifier from an environment snapshot (default `process.env`).
 *
 * Returns `undefined` when no `MYC_PROFILE_PUBLIC_KEY_*` exists (verification
 * disabled, legacy behavior). Throws `ProfileSignatureConfigurationError` for
 * any invalid entry: an invalid configuration never means "disabled".
 * Synchronous, so Express factories and Fastify registration fail at startup.
 */
export function loadProfileSignatureVerifierFromEnv(
  env: EnvironmentSource = process.env
): ProfileSignatureVerifier | undefined {
  const toleranceSeconds = parseTolerance(env)
  const expectedAudience = parseAudience(env)
  const keys = loadPublicKeys(env)

  if (keys.size === 0) return undefined

  return new ProfileSignatureVerifier(keys, toleranceSeconds, expectedAudience)
}
