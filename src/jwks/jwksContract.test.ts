import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { ProfileSignatureConfigurationError } from "../errors.js"
import {
  PROFILE_JWKS_DEFAULT_MAX_AGE_SECONDS,
  PROFILE_JWKS_FETCH_TIMEOUT_SECONDS,
  PROFILE_JWKS_MAX_BYTES,
  PROFILE_JWKS_MAX_MAX_AGE_SECONDS,
  PROFILE_JWKS_MIN_MAX_AGE_SECONDS,
  PROFILE_JWKS_PATH,
  PROFILE_JWKS_REFETCH_COOLDOWN_SECONDS,
  PROFILE_JWKS_EMPTY_RETRY_SECONDS,
} from "../settings.js"
import {
  CONTRACT,
  GATEWAY_JWKS_CONTRACT_FILE,
  JWKS_CONTRACT,
  JWKS_CONTRACT_FILE,
  publicKeysFor,
} from "../testdata/profileSignatureContract.js"
import { parseProfileJwks } from "./parseProfileJwks.js"
import { parseProfileJwksUrl } from "./parseProfileJwksUrl.js"
import { readJwksCacheMaxAge } from "./readJwksCacheMaxAge.js"

function outcomeOf(document: string): [string, string[]] {
  try {
    const keys = parseProfileJwks(document)
    return ["valid", [...keys.keys()].sort()]
  } catch (error) {
    expect(error).toBeInstanceOf(ProfileSignatureConfigurationError)
    return ["invalid_jwks", []]
  }
}

describe("profile JWKS contract (gateway → JS)", () => {
  it.each(JWKS_CONTRACT.vectors.map((vector) => [vector.name, vector] as const))(
    "%s",
    (_name, vector) => {
      expect(outcomeOf(vector.document)).toEqual([
        vector.expected,
        vector.expectedKids,
      ])
    }
  )

  it.each(JWKS_CONTRACT.cacheControl.map((vector) => [vector.cacheControl, vector] as const))(
    "Cache-Control %s",
    (_value, vector) => {
      expect(readJwksCacheMaxAge(vector.cacheControl)).toBe(vector.expectedSeconds)
    }
  )

  it.each(
    JWKS_CONTRACT.urls.map(
      (vector) =>
        [JSON.stringify(vector.configured), vector.allowInsecureHttp, vector] as const
    )
  )("MYCELIUM_JWKS_URL %s (insecure HTTP allowed: %s)", (_configured, _allow, vector) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const resolve = () =>
        parseProfileJwksUrl(vector.configured, vector.allowInsecureHttp).href

      if (vector.resolved === null) {
        expect(resolve).toThrow(ProfileSignatureConfigurationError)
      } else {
        expect(resolve()).toBe(vector.resolved)
      }
    } finally {
      warn.mockRestore()
    }
  })

  it("covers the MYCELIUM_JWKS_URL forms", () => {
    expect(JWKS_CONTRACT.urls.length).toBeGreaterThan(0)
  })

  it("published document carries the same keys as the signature vectors", () => {
    const published = parseProfileJwks(JWKS_CONTRACT.published)
    const pem = publicKeysFor(["1", "2"])

    expect([...published.keys()]).toEqual(["1", "2"])
    for (const kid of ["1", "2"]) {
      expect(published.get(kid)?.equals(pem.get(kid)!)).toBe(true)
    }
    expect(Object.keys(CONTRACT.publicKeys).sort()).toEqual(["1", "2"])
  })

  it("SDK constants match the gateway contract", () => {
    expect(JWKS_CONTRACT.contract).toMatchObject({
      path: PROFILE_JWKS_PATH,
      urlVariable: "MYCELIUM_JWKS_URL",
      insecureHttpVariable: "MYCELIUM_JWKS_ALLOW_INSECURE_HTTP",
      audienceVariable: "MYC_PROFILE_SIGNATURE_AUDIENCE",
      fetchTimeoutSeconds: PROFILE_JWKS_FETCH_TIMEOUT_SECONDS,
      maxBytes: PROFILE_JWKS_MAX_BYTES,
      refetchCooldownSeconds: PROFILE_JWKS_REFETCH_COOLDOWN_SECONDS,
      emptyRetrySeconds: PROFILE_JWKS_EMPTY_RETRY_SECONDS,
      defaultMaxAgeSeconds: PROFILE_JWKS_DEFAULT_MAX_AGE_SECONDS,
      minMaxAgeSeconds: PROFILE_JWKS_MIN_MAX_AGE_SECONDS,
      maxMaxAgeSeconds: PROFILE_JWKS_MAX_MAX_AGE_SECONDS,
    })
  })

  it.skipIf(!existsSync(GATEWAY_JWKS_CONTRACT_FILE))(
    "local copy is byte-identical to the gateway output",
    () => {
      const digest = (path: string) =>
        createHash("sha256")
          .update(readFileSync(path, "utf8").replace(/\r\n/g, "\n"))
          .digest("hex")

      expect(digest(JWKS_CONTRACT_FILE)).toBe(digest(GATEWAY_JWKS_CONTRACT_FILE))
    }
  )
})
