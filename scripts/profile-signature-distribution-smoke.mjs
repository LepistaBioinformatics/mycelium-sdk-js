// Test the built/packed SDK, including actual EdDSA decisions in CJS and ESM.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { resolve, join } from "node:path"
import { pathToFileURL } from "node:url"

const root = resolve(process.argv[2] ?? ".")
const fixtures = JSON.parse(readFileSync(new URL("../src/testdata/profile-signature/vectors.json", import.meta.url), "utf8"))
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
    const env = { MYC_PROFILE_SIGNATURE_TOLERANCE_SECONDS: String(vector.toleranceSeconds) }
    for (const version of vector.trustedKeyVersions) env[`MYC_PROFILE_PUBLIC_KEY_${version}`] = fixtures.publicKeys[version]
    if (vector.expectedAudience !== null) env.MYC_PROFILE_SIGNATURE_AUDIENCE = vector.expectedAudience
    const verifier = sdk.loadProfileSignatureVerifierFromEnv(env)
    assert.ok(verifier)
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
  // Real gateway JSON may serialize this optional field as null.
  assert.equal(sdk.ProfileSchema.shape.verboseStatus.parse(null), null)
  console.log(`PASS Node ${process.version} ${format}: 3 entrypoints and ${fixtures.vectors.length} Rust vectors`)
}
