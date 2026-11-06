import { createPublicKey } from "node:crypto"
import { expect, it, vi } from "vitest"
import { parseProfileJwks } from "./jwks/parseProfileJwks.js"
import { loadProfileSignatureVerifierFromEnv } from "./profileSignatureConfig.js"
import {
  CONTRACT,
  JWKS_CONTRACT,
  TEST_AUDIENCE,
  TEST_JWKS_URL,
  vectorNamed,
} from "./testdata/profileSignatureContract.js"

vi.mock("node:crypto", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:crypto")>()
  return { ...original, createPublicKey: vi.fn(original.createPublicKey) }
})

it("imports the JWKS once and reuses the prepared keys on repeated verification", async () => {
  const fetcher = vi.fn(async () => ({
    keys: parseProfileJwks(JWKS_CONTRACT.published),
    maxAgeSeconds: 600,
  }))
  const verifier = loadProfileSignatureVerifierFromEnv(
    { MYCELIUM_JWKS_URL: TEST_JWKS_URL, MYC_PROFILE_SIGNATURE_AUDIENCE: TEST_AUDIENCE },
    fetcher
  )!
  await verifier.prefetch()
  vi.mocked(createPublicKey).mockClear()
  const preparedKey = verifier.store.current().keys.get("1")

  const vector = vectorNamed("valid_v1")
  for (let index = 0; index < 3; index += 1) {
    const profile = await verifier.verifyAndDecode(vector.profileHeader, vector.signature, vector.nowSeconds)
    expect(profile.accId).toBe(CONTRACT.expectedValidProfile.accId)
    expect(verifier.store.current().keys.get("1")).toBe(preparedKey)
  }

  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(createPublicKey).not.toHaveBeenCalled()
})
