import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { ProfileSignatureError } from "../errors.js"
import { loadProfileSignatureVerifierFromEnv } from "../profileSignatureConfig.js"
import {
  CONTRACT,
  CONTRACT_FILE,
  GATEWAY_CONTRACT_FILE,
  environmentFor,
  type ContractVector,
} from "../testdata/profileSignatureContract.js"
import {
  profileHeaderHash,
  verifyAndDecodeProfile,
  verifyProfileSignature,
} from "./verifyProfileSignature.js"

function verifierFor(vector: ContractVector) {
  const extra: Record<string, string> = {
    MYC_PROFILE_SIGNATURE_TOLERANCE_SECONDS: String(vector.toleranceSeconds),
  }
  if (vector.expectedAudience !== null) {
    extra.MYC_PROFILE_SIGNATURE_AUDIENCE = vector.expectedAudience
  }

  const verifier = loadProfileSignatureVerifierFromEnv(
    environmentFor(vector.trustedKeyVersions, extra)
  )
  if (verifier === undefined) throw new Error("verifier expected")
  return verifier
}

async function outcomeOf(vector: ContractVector): Promise<string> {
  try {
    const profile = await verifyAndDecodeProfile(
      vector.profileHeader,
      vector.signature,
      verifierFor(vector),
      vector.nowSeconds
    )
    expect(profile.accId).toBe(CONTRACT.expectedValidProfile.accId)
    expect(profile.isStaff).toBe(CONTRACT.expectedValidProfile.isStaff)
    return "valid"
  } catch (error) {
    if (error instanceof ProfileSignatureError) return error.reason
    throw error
  }
}

describe("profile signature contract (gateway → JS)", () => {
  it.each(CONTRACT.vectors.map((vector) => [vector.name, vector] as const))(
    "%s",
    async (_name, vector) => {
      expect(await outcomeOf(vector)).toBe(vector.expected)
    }
  )

  it("covers every rejection reason", () => {
    const reasons = new Set(CONTRACT.vectors.map((vector) => vector.expected))
    for (const reason of [
      "valid",
      "missing_signature",
      "malformed_signature",
      "unsupported_algorithm",
      "unknown_key",
      "invalid_signature",
      "invalid_claims",
      "timestamp_out_of_tolerance",
      "profile_hash_mismatch",
      "audience_mismatch",
      "invalid_profile",
    ]) {
      expect(reasons.has(reason)).toBe(true)
    }
  })

  it.skipIf(!existsSync(GATEWAY_CONTRACT_FILE))(
    "local copy is byte-identical to the gateway output",
    () => {
      const digest = (path: string) =>
        createHash("sha256")
          .update(readFileSync(path, "utf8").replace(/\r\n/g, "\n"))
          .digest("hex")

      expect(digest(CONTRACT_FILE)).toBe(digest(GATEWAY_CONTRACT_FILE))
    }
  )
})

describe("verifyProfileSignature", () => {
  const vector = CONTRACT.vectors[0] as ContractVector

  it("hashes the exact header (RFC 6234 'abc')", () => {
    expect(profileHeaderHash("abc")).toBe(
      "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0"
    )
  })

  it("rejects an empty profile before parsing", async () => {
    await expect(
      verifyProfileSignature("", vector.signature, verifierFor(vector))
    ).rejects.toMatchObject({ reason: "missing_profile" })
  })

  it.each([-1, 2 ** 53, 1.5, Number.NaN])(
    "fails closed on an invalid verifier clock (%s)",
    async (clock) => {
      await expect(
        verifyProfileSignature(
          vector.profileHeader,
          vector.signature,
          verifierFor(vector),
          clock
        )
      ).rejects.toBeInstanceOf(RangeError)
    }
  )

  it("returns a promise that must be awaited", () => {
    const pending = verifyProfileSignature(
      vector.profileHeader,
      vector.signature,
      verifierFor(vector),
      vector.nowSeconds
    )
    expect(pending).toBeInstanceOf(Promise)
    return pending
  })
})
