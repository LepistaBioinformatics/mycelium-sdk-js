import { createPublicKey, type KeyObject } from "node:crypto"
import { ProfileSignatureConfigurationError } from "../errors.js"
import { isCanonicalKeyVersion } from "../profileSignatureVerifier.js"

const JWKS = "profile JWKS"
const BASE64URL = /^[A-Za-z0-9_-]+$/
const ED25519_PUBLIC_KEY_BYTES = 32

type JsonObject = Record<string, unknown>

function invalid(problem: string): ProfileSignatureConfigurationError {
  return new ProfileSignatureConfigurationError(`${JWKS} ${problem}`)
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function expectMember(
  jwk: JsonObject,
  name: string,
  expected: string,
  required: boolean
): void {
  if (!(name in jwk) && !required) return
  if (jwk[name] !== expected) {
    throw invalid(`entry member ${name} must be ${expected}`)
  }
}

function readKid(jwk: JsonObject): string {
  const kid = jwk.kid
  if (typeof kid !== "string" || !isCanonicalKeyVersion(kid)) {
    throw invalid("entry kid must be a canonical positive integer")
  }
  return kid
}

function readX(jwk: JsonObject): string {
  const x = jwk.x
  const isKey =
    typeof x === "string" &&
    BASE64URL.test(x) &&
    Buffer.from(x, "base64url").length === ED25519_PUBLIC_KEY_BYTES &&
    Buffer.from(x, "base64url").toString("base64url") === x
  if (!isKey) throw invalid("entry x must be a 32-byte Base64URL key")
  return x as string
}

function importEntry(entry: unknown): [string, KeyObject] {
  if (!isObject(entry)) throw invalid("entry is not a JSON object")
  if ("d" in entry) throw invalid("entry carries private key material (d)")

  expectMember(entry, "kty", "OKP", true)
  expectMember(entry, "crv", "Ed25519", true)
  expectMember(entry, "use", "sig", false)
  expectMember(entry, "alg", "EdDSA", false)

  const kid = readKid(entry)
  const x = readX(entry)
  try {
    const key = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x },
      format: "jwk",
    })
    return [kid, key]
  } catch {
    throw invalid("entry x is not an Ed25519 key")
  }
}

/**
 * Parse the gateway profile JWKS (`{"keys": [...]}`) into keys by `kid`.
 *
 * Strict and all-or-nothing: one unsafe entry (private member `d`, other key
 * type or curve, wrong length, non-canonical or duplicated `kid`, `use` other
 * than `sig`, `alg` other than `EdDSA`) refuses the whole document, so the
 * verifier keeps its last valid set. Unknown members are ignored (RFC 7517).
 * Throws `ProfileSignatureConfigurationError`.
 */
export function parseProfileJwks(document: string): Map<string, KeyObject> {
  let parsed: unknown
  try {
    parsed = JSON.parse(document)
  } catch {
    throw invalid("is not JSON")
  }

  const entries = isObject(parsed) ? parsed.keys : undefined
  if (!Array.isArray(entries) || entries.length === 0) {
    throw invalid("has no keys array")
  }

  const keys = new Map<string, KeyObject>()
  for (const entry of entries) {
    const [kid, key] = importEntry(entry)
    if (keys.has(kid)) throw invalid("has a duplicated kid")
    keys.set(kid, key)
  }
  return keys
}
