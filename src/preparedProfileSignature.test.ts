import { createPublicKey } from "node:crypto"
import { expect, it, vi } from "vitest"
import { loadProfileSignatureVerifierFromEnv } from "./profileSignatureConfig.js"
import { verifyAndDecodeProfile } from "./functions/verifyProfileSignature.js"
import { CONTRACT, environmentFor, vectorNamed } from "./testdata/profileSignatureContract.js"

vi.mock("node:crypto", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:crypto")>()
  return { ...original, createPublicKey: vi.fn(original.createPublicKey) }
})

it("imports PEM once and reuses the prepared key on repeated verification", async () => {
  vi.mocked(createPublicKey).mockClear()
  const env = environmentFor(["1"])
  const verifier = loadProfileSignatureVerifierFromEnv(env)
  expect(verifier).toBeDefined()
  expect(createPublicKey).toHaveBeenCalledTimes(1)
  const preparedKey = verifier?.keyFor("1")
  // Changing the input environment after construction must not change trust.
  env.MYC_PROFILE_PUBLIC_KEY_1 = "broken after startup"
  const vector = vectorNamed("valid_v1")
  for (let index = 0; index < 3; index += 1) {
    const profile = await verifyAndDecodeProfile(vector.profileHeader, vector.signature, verifier!, vector.nowSeconds)
    expect(profile.accId).toBe(CONTRACT.expectedValidProfile.accId)
    expect(verifier?.keyFor("1")).toBe(preparedKey)
  }
  expect(createPublicKey).toHaveBeenCalledTimes(1)
})
