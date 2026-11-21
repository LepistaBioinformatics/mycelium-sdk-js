import { afterEach, describe, expect, it, vi } from "vitest"
import { ProfileSignatureConfigurationError } from "./errors.js"
import {
  loadProfileSignatureVerifierFromEnv,
  prepareProfileSignatureVerifier,
} from "./profileSignatureConfig.js"
import { isCanonicalKeyVersion } from "./profileSignatureVerifier.js"
import {
  TEST_AUDIENCE,
  TEST_JWKS_URL,
  fixedFetcher,
} from "./testdata/profileSignatureContract.js"

const URL_ENV = "MYCELIUM_JWKS_URL"
const AUDIENCE_ENV = "MYC_PROFILE_SIGNATURE_AUDIENCE"
const INSECURE_ENV = "MYCELIUM_JWKS_ALLOW_INSECURE_HTTP"
const TOLERANCE_ENV = "MYC_PROFILE_SIGNATURE_TOLERANCE_SECONDS"

const ENABLED = { [URL_ENV]: TEST_JWKS_URL, [AUDIENCE_ENV]: TEST_AUDIENCE }
const HTTP_URL = "http://localhost:8080/.well-known/mycelium-profile-jwks.json"

function load(env: Record<string, string>) {
  return loadProfileSignatureVerifierFromEnv(env, fixedFetcher(["1"]))
}

function configurationError(env: Record<string, string>): Error {
  try {
    load(env)
  } catch (error) {
    expect(error).toBeInstanceOf(ProfileSignatureConfigurationError)
    return error as Error
  }
  throw new Error("configuration error expected")
}

afterEach(() => vi.restoreAllMocks())

describe("loadProfileSignatureVerifierFromEnv", () => {
  it("is enabled by MYCELIUM_JWKS_URL only", () => {
    expect(load({})).toBeUndefined()
    expect(load({ [AUDIENCE_ENV]: TEST_AUDIENCE })).toBeUndefined()
    expect(load({ [TOLERANCE_ENV]: "30" })).toBeUndefined()
    expect(load(ENABLED)).toBeDefined()
  })

  it("reads the URL, tolerance and audience without network access", () => {
    const fetcher = vi.fn(fixedFetcher(["1"]))
    const verifier = loadProfileSignatureVerifierFromEnv(
      { ...ENABLED, [TOLERANCE_ENV]: "30" },
      fetcher
    )

    expect(verifier?.store.url.href).toBe(TEST_JWKS_URL)
    expect(verifier?.toleranceSeconds).toBe(30)
    expect(verifier?.expectedAudience).toBe(TEST_AUDIENCE)
    expect(verifier?.store.current().keys.size).toBe(0)
    expect(fetcher).not.toHaveBeenCalled()
    expect(Object.isFrozen(verifier)).toBe(true)
  })

  it("requires the audience when enabled", () => {
    const error = configurationError({ [URL_ENV]: TEST_JWKS_URL })

    expect(error.message).toContain(AUDIENCE_ENV)
  })

  it("requires https unless the development switch is true", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const http = { [URL_ENV]: HTTP_URL, [AUDIENCE_ENV]: TEST_AUDIENCE }

    configurationError(http)
    configurationError({ ...http, [INSECURE_ENV]: "false" })
    expect(load({ ...http, [INSECURE_ENV]: " true " })).toBeDefined()
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["relative URL", { ...ENABLED, [URL_ENV]: "/.well-known/jwks.json" }],
    ["empty URL", { ...ENABLED, [URL_ENV]: "" }],
    ["ftp URL", { ...ENABLED, [URL_ENV]: "ftp://gateway/jwks.json" }],
    ["file URL", { ...ENABLED, [URL_ENV]: "file:///etc/jwks.json" }],
    ["credentials", { ...ENABLED, [URL_ENV]: "https://user:pass@gateway/jwks.json" }],
    ["switch not boolean", { ...ENABLED, [INSECURE_ENV]: "yes" }],
    ["tolerance zero", { [TOLERANCE_ENV]: "0" }],
    ["tolerance negative", { [TOLERANCE_ENV]: "-5" }],
    ["tolerance text", { [TOLERANCE_ENV]: "sixty" }],
    ["tolerance fraction", { [TOLERANCE_ENV]: "1.5" }],
    ["tolerance overflow", { [TOLERANCE_ENV]: "9007199254740992" }],
    ["oversized tolerance", { [TOLERANCE_ENV]: "9".repeat(5000) }],
    ["tolerance above five minutes", { [TOLERANCE_ENV]: "301" }],
    ["tolerance of one day", { [TOLERANCE_ENV]: "86400" }],
    ["tolerance with leading zero", { [TOLERANCE_ENV]: "060" }],
    ["blank audience", { [AUDIENCE_ENV]: "  " }],
    ["switch invalid while disabled", { [INSECURE_ENV]: "maybe" }],
  ])("never disables on invalid config: %s", (_name, env) => {
    const error = configurationError(env)

    expect(error.message).not.toContain("user:pass")
  })

  it("accepts canonical tolerances up to five minutes", () => {
    expect(load({ ...ENABLED, [TOLERANCE_ENV]: "1" })?.toleranceSeconds).toBe(1)
    expect(load({ ...ENABLED, [TOLERANCE_ENV]: " 120 " })?.toleranceSeconds).toBe(120)
    expect(load({ ...ENABLED, [TOLERANCE_ENV]: "300" })?.toleranceSeconds).toBe(300)
  })

  it("names the accepted range when the tolerance is too wide", () => {
    const error = configurationError({ ...ENABLED, [TOLERANCE_ENV]: "301" })

    expect(error.message).toContain("between 1 and 300")
  })

  it("reads process.env by default", () => {
    process.env[URL_ENV] = TEST_JWKS_URL
    process.env[AUDIENCE_ENV] = TEST_AUDIENCE
    try {
      expect(loadProfileSignatureVerifierFromEnv()?.expectedAudience).toBe(
        TEST_AUDIENCE
      )
    } finally {
      delete process.env[URL_ENV]
      delete process.env[AUDIENCE_ENV]
    }
  })
})

describe("prepareProfileSignatureVerifier", () => {
  it("downloads the keys before serving", async () => {
    const verifier = await prepareProfileSignatureVerifier(
      ENABLED,
      fixedFetcher(["1", "2"])
    )

    expect([...(verifier?.store.current().keys.keys() ?? [])]).toEqual(["1", "2"])
  })

  it("rejects when the keys cannot be fetched", async () => {
    await expect(
      prepareProfileSignatureVerifier(ENABLED, async () => {
        throw new Error("gateway down")
      })
    ).rejects.toThrow("gateway down")
  })

  it("resolves undefined when disabled", async () => {
    expect(await prepareProfileSignatureVerifier({})).toBeUndefined()
  })
})

describe("isCanonicalKeyVersion", () => {
  it("accepts only canonical versions", () => {
    expect(isCanonicalKeyVersion("1")).toBe(true)
    expect(isCanonicalKeyVersion("4294967295")).toBe(true)
    for (const raw of ["", "0", "01", "+1", " 1", "1.0", "4294967296"]) {
      expect(isCanonicalKeyVersion(raw)).toBe(false)
    }
  })
})
