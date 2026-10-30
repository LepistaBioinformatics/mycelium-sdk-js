import Fastify from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProfileSignatureConfigurationError } from "../errors.js"
import { loadProfileSignatureVerifierFromEnv } from "../profileSignatureConfig.js"
import {
  DEFAULT_PROFILE_KEY,
  DEFAULT_PROFILE_SIGNATURE_KEY,
} from "../settings.js"
import {
  CONTRACT,
  environmentFor,
  vectorNamed,
} from "../testdata/profileSignatureContract.js"
import { fastifyProfilePlugin } from "./index.js"

const VALID = vectorNamed("valid_v1")
const ACCOUNT = CONTRACT.expectedValidProfile.accId

type Headers = Record<string, string | string[]>

async function buildApp(calls: { count: number }, reasons: string[], environment = "development") {
  const app = Fastify()
  await app.register(fastifyProfilePlugin, {
    environment,
    signatureVerifier: loadProfileSignatureVerifierFromEnv(environmentFor(["1"])),
    onSignatureRejected: (reason) => reasons.push(reason),
  })
  app.get("/whoami", async (request) => {
    calls.count += 1
    return { accId: request.profile?.accId ?? null }
  })
  return app
}

function signed(vector = VALID): Headers {
  return {
    [DEFAULT_PROFILE_KEY]: vector.profileHeader,
    [DEFAULT_PROFILE_SIGNATURE_KEY]: vector.signature,
  }
}

const REJECTIONS: Record<string, [Headers, string]> = {
  missing_everything: [{}, "missing_profile"],
  missing_signature: [{ [DEFAULT_PROFILE_KEY]: VALID.profileHeader }, "missing_signature"],
  swapped_profile: [signed(vectorNamed("profile_swapped")), "profile_hash_mismatch"],
  duplicate_signature: [
    { ...signed(), [DEFAULT_PROFILE_SIGNATURE_KEY]: [VALID.signature, VALID.signature] },
    "duplicate_header",
  ],
  duplicate_profile: [
    { ...signed(), [DEFAULT_PROFILE_KEY]: [VALID.profileHeader, VALID.profileHeader] },
    "duplicate_header",
  ],
  hs256: [signed(vectorNamed("alg_hs256_confusion")), "unsupported_algorithm"],
  wrong_key: [signed(vectorNamed("wrong_key_same_kid")), "invalid_signature"],
}

describe("fastifyProfilePlugin with verification enabled", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(VALID.nowSeconds * 1000)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("accepts a gateway signature", async () => {
    const calls = { count: 0 }
    const app = await buildApp(calls, [])

    const response = await app.inject({ method: "GET", url: "/whoami", headers: signed() })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ accId: ACCOUNT })
    expect(calls.count).toBe(1)
  })

  it.each(["development", "production"].flatMap((environment) =>
    Object.entries(REJECTIONS).map(([name, rejection]) => [environment, name, rejection] as const)
  ))(
    "rejects %s %s without reaching the handler",
    async (environment, _case, [headers, reason]) => {
      const calls = { count: 0 }
      const reasons: string[] = []
      const app = await buildApp(calls, reasons, environment)

      const response = await app.inject({ method: "GET", url: "/whoami", headers })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({ detail: "Unable to verify Mycelium profile" })
      expect(calls.count).toBe(0)
      expect(reasons).toEqual([reason])
    }
  )

  it.each(["development", "production"])("internal clock failure returns generic 500 (%s)", async (environment) => {
    vi.spyOn(Date, "now").mockReturnValue(Number.NaN)
    const calls = { count: 0 }
    const reasons: string[] = []
    const app = await buildApp(calls, reasons, environment)
    const response = await app.inject({ method: "GET", url: "/whoami", headers: signed() })
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ detail: "Unable to check user identity. Please contact administrators" })
    expect(calls.count).toBe(0)
    expect(reasons).toEqual(["internal_error"])
    await app.close()
  })
})

describe("fastifyProfilePlugin registration", () => {
  const variable = "MYC_PROFILE_PUBLIC_KEY_1"

  afterEach(() => {
    delete process.env[variable]
  })

  it("invalid configuration fails the registration", async () => {
    process.env[variable] = "broken"
    const app = Fastify()

    await expect(
      app.register(fastifyProfilePlugin, { environment: "production" }).ready()
    ).rejects.toBeInstanceOf(ProfileSignatureConfigurationError)
  })

  it("without configuration the signature header is ignored", async () => {
    const app = Fastify()
    await app.register(fastifyProfilePlugin, { environment: "production" })
    app.get("/whoami", async (request) => ({ accId: request.profile?.accId ?? null }))

    const response = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { ...signed(), [DEFAULT_PROFILE_SIGNATURE_KEY]: "not-a-jws" },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ accId: ACCOUNT })
  })
})
