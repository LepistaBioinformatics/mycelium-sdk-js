import type { KeyObject } from "node:crypto"

const CANONICAL_POSITIVE_INTEGER = /^[1-9][0-9]*$/
const MAX_KEY_VERSION = 4_294_967_295

/**
 * One verification pass: the trusted Ed25519 keys at an instant, by `kid`,
 * and the rules. Immutable; the key map is private.
 *
 * The JWKS-backed verifier builds one per request from its cached keys; the
 * contract tests build one directly. The audience is optional here so the
 * shared vectors can exercise both cases; a configured service always has
 * one (see `JwksProfileSignatureVerifier`).
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

/** Canonical decimal key version (`kid`): 1..4294967295, no leading zeros. */
export function isCanonicalKeyVersion(raw: string): boolean {
  return CANONICAL_POSITIVE_INTEGER.test(raw) && Number(raw) <= MAX_KEY_VERSION
}
