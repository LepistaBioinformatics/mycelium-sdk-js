// Test the built/packed SDK, including actual EdDSA decisions in CJS and ESM.
import assert from "node:assert/strict"
import { createPublicKey } from "node:crypto"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve, join } from "node:path"
import { pathToFileURL } from "node:url"

const root = resolve(process.argv[2] ?? ".")
const fixtures = JSON.parse(readFileSync(new URL("../src/testdata/profile-signature/vectors.json", import.meta.url), "utf8"))
const jwksFixtures = JSON.parse(readFileSync(new URL("../src/testdata/profile-signature/jwks-vectors.json", import.meta.url), "utf8"))
const require = createRequire(import.meta.url)
for (const format of ["js", "cjs"]) {
  for (const entry of ["", "express", "fastify"]) {
    const path = join(root, "dist", entry, `index.${format}`)
    if (format === "js") await import(pathToFileURL(path).href)
    else require(path)
  }
  const path = join(root, "dist", `index.${format}`)
  const sdk = format === "js" ? await import(pathToFileURL(path).href) : require(path)
  for (const vector of fixtures.vectors) {
    const keys = new Map(vector.trustedKeyVersions.map((version) => [version, createPublicKey(fixtures.publicKeys[version])]))
    const verifier = new sdk.ProfileSignatureVerifier(keys, vector.toleranceSeconds, vector.expectedAudience ?? undefined)
    let outcome = "valid"
    try {
      const profile = await sdk.verifyAndDecodeProfile(vector.profileHeader, vector.signature, verifier, vector.nowSeconds)
      assert.equal(profile.accId, fixtures.expectedValidProfile.accId)
    } catch (error) {
      if (!(error instanceof sdk.ProfileSignatureError)) throw error
      outcome = error.reason
    }
    assert.equal(outcome, vector.expected, `${format}: ${vector.name}`)
  }
  for (const vector of jwksFixtures.vectors) {
    let outcome = "valid"
    try {
      sdk.parseProfileJwks(vector.document)
    } catch (error) {
      if (!(error instanceof sdk.ProfileSignatureConfigurationError)) throw error
      outcome = "invalid_jwks"
    }
    assert.equal(outcome, vector.expected, `${format}: ${vector.name}`)
  }
  const jwksVerifier = sdk.loadProfileSignatureVerifierFromEnv(
    { MYCELIUM_JWKS_URL: "https://gateway.test/jwks.json", MYC_PROFILE_SIGNATURE_AUDIENCE: "billing-api" },
    async () => ({ keys: sdk.parseProfileJwks(jwksFixtures.published), maxAgeSeconds: 600 })
  )
  const valid = fixtures.vectors.find((vector) => vector.name === "valid_v1")
  const profile = await jwksVerifier.verifyAndDecode(valid.profileHeader, valid.signature, valid.nowSeconds)
  assert.equal(profile.accId, fixtures.expectedValidProfile.accId)
  // Real gateway JSON may serialize this optional field as null.
  assert.equal(sdk.ProfileSchema.shape.verboseStatus.parse(null), null)
  console.log(`PASS Node ${process.version} ${format}: 3 entrypoints, ${fixtures.vectors.length} signature and ${jwksFixtures.vectors.length} JWKS gateway vectors`)
}
