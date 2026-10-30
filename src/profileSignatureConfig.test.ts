import { generateKeyPairSync } from "node:crypto"
import { describe, expect, it } from "vitest"
import { ProfileSignatureConfigurationError } from "./errors.js"
import {
  isCanonicalKeyVersion,
  loadProfileSignatureVerifierFromEnv,
} from "./profileSignatureConfig.js"
import { CONTRACT, environmentFor } from "./testdata/profileSignatureContract.js"

const TEST_PRIVATE_PEM_V1 = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIJ1hsZ3v/VpguoRK9JLsLMREScVpezJpGXA7rAMcrn9g
-----END PRIVATE KEY-----
`

describe("loadProfileSignatureVerifierFromEnv", () => {
  it("is disabled without public keys", () => {
    expect(loadProfileSignatureVerifierFromEnv({})).toBeUndefined()
    expect(
      loadProfileSignatureVerifierFromEnv({
        MYC_PROFILE_SIGNATURE_TOLERANCE_SECONDS: "30",
      })
    ).toBeUndefined()
  })

  it("loads a rotation keyset with defaults", () => {
    const verifier = loadProfileSignatureVerifierFromEnv(
      environmentFor(["2", "1"])
    )

    expect(verifier?.keyVersions).toEqual(["1", "2"])
    expect(verifier?.toleranceSeconds).toBe(60)
    expect(verifier?.expectedAudience).toBeUndefined()
    expect(Object.isFrozen(verifier)).toBe(true)
  })

  it("reads tolerance and audience", () => {
    const verifier = loadProfileSignatureVerifierFromEnv(
      environmentFor(["1"], {
        MYC_PROFILE_SIGNATURE_TOLERANCE_SECONDS: "30",
        MYC_PROFILE_SIGNATURE_AUDIENCE: "billing-api",
      })
    )

    expect(verifier?.toleranceSeconds).toBe(30)
    expect(verifier?.expectedAudience).toBe("billing-api")
  })

  const ed448 = generateKeyPairSync("ed448")
    .publicKey.export({ type: "spki", format: "pem" })
    .toString()
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
    .publicKey.export({ type: "spki", format: "pem" })
    .toString()

  it.each([
    ["tolerance zero", { MYC_PROFILE_SIGNATURE_TOLERANCE_SECONDS: "0" }],
    ["tolerance negative", { MYC_PROFILE_SIGNATURE_TOLERANCE_SECONDS: "-5" }],
    ["tolerance text", { MYC_PROFILE_SIGNATURE_TOLERANCE_SECONDS: "sixty" }],
    ["tolerance fraction", { MYC_PROFILE_SIGNATURE_TOLERANCE_SECONDS: "1.5" }],
    ["tolerance overflow", { MYC_PROFILE_SIGNATURE_TOLERANCE_SECONDS: "9007199254740992" }],
    ["oversized tolerance", { MYC_PROFILE_SIGNATURE_TOLERANCE_SECONDS: "9".repeat(5000) }],
    ["blank audience", { MYC_PROFILE_SIGNATURE_AUDIENCE: "  " }],
    ["empty suffix", { MYC_PROFILE_PUBLIC_KEY_: "x" }],
    ["zero suffix", { MYC_PROFILE_PUBLIC_KEY_0: "x" }],
    ["leading zero suffix", { MYC_PROFILE_PUBLIC_KEY_01: "x" }],
    ["overflow suffix", { MYC_PROFILE_PUBLIC_KEY_4294967296: "x" }],
    ["named suffix", { MYC_PROFILE_PUBLIC_KEY_V1: "x" }],
    ["empty value", { MYC_PROFILE_PUBLIC_KEY_1: "" }],
    ["garbage", { MYC_PROFILE_PUBLIC_KEY_1: "not a pem" }],
    ["private key", { MYC_PROFILE_PUBLIC_KEY_1: TEST_PRIVATE_PEM_V1 }],
    ["ed448 key", { MYC_PROFILE_PUBLIC_KEY_1: ed448 }],
    ["rsa key", { MYC_PROFILE_PUBLIC_KEY_1: rsa }],
  ])("never disables on invalid config: %s", (_name, env) => {
    let thrown: unknown
    try {
      loadProfileSignatureVerifierFromEnv(env)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(ProfileSignatureConfigurationError)
    expect(String((thrown as Error).message)).not.toContain("BEGIN")
  })

  it("accepts only canonical versions", () => {
    expect(isCanonicalKeyVersion("1")).toBe(true)
    expect(isCanonicalKeyVersion("4294967295")).toBe(true)
    for (const raw of ["", "0", "01", "+1", " 1", "1.0", "4294967296"]) {
      expect(isCanonicalKeyVersion(raw)).toBe(false)
    }
  })

  it("accepts the maximum safe integer tolerance", () => {
    const verifier = loadProfileSignatureVerifierFromEnv(environmentFor(["1"], {
      MYC_PROFILE_SIGNATURE_TOLERANCE_SECONDS: "9007199254740991",
    }))
    expect(verifier?.toleranceSeconds).toBe(Number.MAX_SAFE_INTEGER)
  })

  it("reads process.env by default", () => {
    const name = "MYC_PROFILE_PUBLIC_KEY_7"
    process.env[name] = CONTRACT.publicKeys["1"]
    try {
      expect(loadProfileSignatureVerifierFromEnv()?.keyVersions).toContain("7")
    } finally {
      delete process.env[name]
    }
  })
})
