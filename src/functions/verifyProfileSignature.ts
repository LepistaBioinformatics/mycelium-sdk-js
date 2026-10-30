import { createHash, timingSafeEqual, type KeyObject } from "node:crypto"
import { compactVerify, errors as joseErrors } from "jose"
import { z } from "zod"
import {
  ProfileSignatureError,
  type ProfileSignatureRejectionReason,
} from "../errors.js"
import type { Profile } from "../models/profile.js"
import {
  isCanonicalKeyVersion,
  type ProfileSignatureVerifier,
} from "../profileSignatureConfig.js"
import { MAX_PROFILE_SIGNATURE_BYTES } from "../settings.js"
import { decodeAndDecompressProfileFromBase64 } from "./decodeAndDecompressProfileFromBase64.js"

/**
 * Strict, local verification of the downstream profile signature.
 *
 * Contract shared with the gateway and the Python SDK: compact JWS with
 * `alg: EdDSA` and the key version as `kid`; claims `{iat, ph, aud}` where
 * `ph` is the unpadded Base64URL SHA-256 of the exact `x-mycelium-profile`
 * value. Checks run in a fixed precedence so every SDK reports the same
 * `reason`. No network, file or environment access.
 *
 * Always `await` it: an un-awaited call would let the request through.
 */

const FORBIDDEN_HEADER_MEMBERS = ["crit", "b64", "jku", "jwk", "x5u", "x5c"]
const ENCODED_DIGEST_LENGTH = 43

function reject(reason: ProfileSignatureRejectionReason): ProfileSignatureError {
  return new ProfileSignatureError(reason)
}

function isCanonicalHash(value: string): boolean {
  if (value.length !== ENCODED_DIGEST_LENGTH) return false

  const raw = Buffer.from(value, "base64url")
  return raw.length === 32 && raw.toString("base64url") === value
}

const claimsSchema = z.object({
  iat: z.number().refine((value) => Number.isSafeInteger(value) && value >= 0),
  ph: z.string().refine(isCanonicalHash),
  aud: z.string().refine((value) => value.trim() !== ""),
})

type ProfileSignatureClaims = z.infer<typeof claimsSchema>

function decodeSegment(segment: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(segment, "base64url").toString("utf8")
    )
    const isObject =
      typeof value === "object" && value !== null && !Array.isArray(value)
    return isObject ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

function splitToken(signatureHeader: string): string[] {
  if (signatureHeader === "") throw reject("missing_signature")

  const parts = signatureHeader.split(".")
  const oversized =
    Buffer.byteLength(signatureHeader, "utf8") > MAX_PROFILE_SIGNATURE_BYTES
  if (oversized || parts.length !== 3) throw reject("malformed_signature")

  return parts
}

function selectKey(
  header: Record<string, unknown>,
  verifier: ProfileSignatureVerifier
): KeyObject {
  if (header.alg !== "EdDSA") throw reject("unsupported_algorithm")

  const hasForbidden = FORBIDDEN_HEADER_MEMBERS.some((member) => member in header)
  if (hasForbidden) throw reject("malformed_signature")

  const kid = header.kid
  const key =
    typeof kid === "string" && isCanonicalKeyVersion(kid)
      ? verifier.keyFor(kid)
      : undefined
  if (key === undefined) throw reject("unknown_key")

  return key
}

async function verifyJws(token: string, key: KeyObject): Promise<Uint8Array> {
  try {
    const { payload } = await compactVerify(token, key, {
      algorithms: ["EdDSA"],
    })
    return payload
  } catch (error) {
    if (error instanceof joseErrors.JWSSignatureVerificationFailed) {
      throw reject("invalid_signature")
    }
    throw reject("malformed_signature")
  }
}

function parseClaims(payload: Uint8Array): ProfileSignatureClaims {
  let decoded: unknown
  try {
    decoded = JSON.parse(Buffer.from(payload).toString("utf8"))
  } catch {
    throw reject("invalid_claims")
  }

  const parsed = claimsSchema.safeParse(decoded)
  if (!parsed.success) throw reject("invalid_claims")

  return parsed.data
}

function resolveNow(nowSeconds?: number): number {
  const now = nowSeconds ?? Math.floor(Date.now() / 1000)
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new RangeError("Verifier clock is outside the safe integer range")
  }

  return now
}

/** Unpadded Base64URL SHA-256 of the exact profile header value. */
export function profileHeaderHash(profileHeader: string): string {
  return createHash("sha256").update(profileHeader, "utf8").digest("base64url")
}

function sameHash(received: string, expected: string): boolean {
  const left = Buffer.from(received, "utf8")
  const right = Buffer.from(expected, "utf8")
  return left.length === right.length && timingSafeEqual(left, right)
}

function checkClaims(
  claims: ProfileSignatureClaims,
  profileHeader: string,
  verifier: ProfileSignatureVerifier,
  now: number
): void {
  if (Math.abs(now - claims.iat) > verifier.toleranceSeconds) {
    throw reject("timestamp_out_of_tolerance")
  }

  if (!sameHash(claims.ph, profileHeaderHash(profileHeader))) {
    throw reject("profile_hash_mismatch")
  }

  const expected = verifier.expectedAudience
  if (expected !== undefined && claims.aud !== expected) {
    throw reject("audience_mismatch")
  }
}

/**
 * Verify that `signatureHeader` authenticates `profileHeader`.
 *
 * Rejects with `ProfileSignatureError` (stable `reason`) on any failure, and
 * with `RangeError` for an invalid verifier clock (internal error). Does not
 * decode the profile; see `verifyAndDecodeProfile`.
 */
export async function verifyProfileSignature(
  profileHeader: string,
  signatureHeader: string,
  verifier: ProfileSignatureVerifier,
  nowSeconds?: number
): Promise<void> {
  if (profileHeader === "") throw reject("missing_profile")

  const parts = splitToken(signatureHeader)
  const header = decodeSegment(parts[0] ?? "")
  if (header === undefined) throw reject("malformed_signature")

  const key = selectKey(header, verifier)
  const payload = await verifyJws(signatureHeader, key)
  const claims = parseClaims(payload)
  checkClaims(claims, profileHeader, verifier, resolveNow(nowSeconds))
}

/** Verify the signature, then decode the profile (`invalid_profile`). */
export async function verifyAndDecodeProfile(
  profileHeader: string,
  signatureHeader: string,
  verifier: ProfileSignatureVerifier,
  nowSeconds?: number
): Promise<Profile> {
  await verifyProfileSignature(profileHeader, signatureHeader, verifier, nowSeconds)

  try {
    return decodeAndDecompressProfileFromBase64(profileHeader)
  } catch {
    throw reject("invalid_profile")
  }
}
