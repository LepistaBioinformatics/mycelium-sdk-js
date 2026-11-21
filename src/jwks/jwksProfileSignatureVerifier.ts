import { ProfileSignatureError } from "../errors.js"
import { verifyAndDecodeProfile } from "../functions/verifyProfileSignature.js"
import type { Profile } from "../models/profile.js"
import { ProfileSignatureVerifier } from "../profileSignatureVerifier.js"
import type { ProfileKeyStore } from "./profileKeyStore.js"
import { readSignatureKeyVersion } from "./readSignatureKeyVersion.js"

/**
 * Downstream verifier whose trusted keys come from the gateway JWKS.
 *
 * Enabled by `MYCELIUM_JWKS_URL`; the expected audience is mandatory, so a
 * signed pair issued for another service is always refused. Verification is
 * the shared, local contract; only the keys are remote, refreshed as
 * described in `ProfileKeyStore`. Build it with
 * `prepareProfileSignatureVerifier()` (downloads the keys before serving) or
 * `loadProfileSignatureVerifierFromEnv()` (keys fetched on first use).
 */
export class JwksProfileSignatureVerifier {
  readonly store: ProfileKeyStore
  readonly toleranceSeconds: number
  readonly expectedAudience: string

  constructor(
    store: ProfileKeyStore,
    toleranceSeconds: number,
    expectedAudience: string
  ) {
    this.store = store
    this.toleranceSeconds = toleranceSeconds
    this.expectedAudience = expectedAudience
    Object.freeze(this)
  }

  /** Download the key set before serving; rejects when it cannot. */
  prefetch(): Promise<void> {
    return this.store.prefetch()
  }

  /**
   * Verify the signed profile, refetching the JWKS once on an unknown,
   * canonical `kid`. Rejects with `ProfileSignatureError` like
   * `verifyAndDecodeProfile`.
   */
  async verifyAndDecode(
    profileHeader: string,
    signatureHeader: string,
    nowSeconds?: number
  ): Promise<Profile> {
    await this.store.refreshIfStale()
    const { generation } = this.store.current()

    try {
      return await this.#verifyWithCurrentKeys(profileHeader, signatureHeader, nowSeconds)
    } catch (error) {
      const deservesRefetch =
        error instanceof ProfileSignatureError &&
        error.reason === "unknown_key" &&
        readSignatureKeyVersion(signatureHeader) !== undefined
      if (!deservesRefetch) throw error
      if (!(await this.store.refreshAfterUnknownKey(generation))) throw error
    }

    return this.#verifyWithCurrentKeys(profileHeader, signatureHeader, nowSeconds)
  }

  #verifyWithCurrentKeys(
    profileHeader: string,
    signatureHeader: string,
    nowSeconds?: number
  ): Promise<Profile> {
    const verifier = new ProfileSignatureVerifier(
      this.store.current().keys,
      this.toleranceSeconds,
      this.expectedAudience
    )
    return verifyAndDecodeProfile(profileHeader, signatureHeader, verifier, nowSeconds)
  }
}
