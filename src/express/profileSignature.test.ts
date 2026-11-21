import express, { type RequestHandler } from "express"
import supertest from "supertest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProfileSignatureConfigurationError } from "../errors.js"
import { resetSharedProfileSignatureVerifier } from "../profileSignatureEnforcement.js"
import {
  DEFAULT_PROFILE_KEY,
  DEFAULT_PROFILE_SIGNATURE_KEY,
} from "../settings.js"
import {
  CONTRACT,
  JWKS_CONTRACT,
  TEST_AUDIENCE,
  jwksVerifierFor,
  vectorNamed,
} from "../testdata/profileSignatureContract.js"
import { getProfileFromHeaderRequired, profileMiddleware } from "./index.js"

const VALID = vectorNamed("valid_v1")
const ACCOUNT = CONTRACT.expectedValidProfile.accId

type Headers = Record<string, string | string[]>

function verifier() {
  return jwksVerifierFor(["1"])
}

function signed(vector = VALID): Headers {
  return {
    [DEFAULT_PROFILE_KEY]: vector.profileHeader,
    [DEFAULT_PROFILE_SIGNATURE_KEY]: vector.signature,
  }
}

const ENTRY_POINTS: Array<[string, (env: string, reasons: string[]) => RequestHandler]> = [
  [
    "profileMiddleware",
    (environment, reasons) =>
      profileMiddleware({
        environment,
        signatureVerifier: verifier(),
        onSignatureRejected: (reason) => reasons.push(reason),
      }),
  ],
  [
    "getProfileFromHeaderRequired",
    (_environment, reasons) =>
      getProfileFromHeaderRequired({
        signatureVerifier: verifier(),
        onSignatureRejected: (reason) => reasons.push(reason),
      }),
  ],
]

function buildApp(handler: RequestHandler, calls: { count: number }) {
  const app = express()
  app.get("/whoami", handler, (req, res) => {
    calls.count += 1
    res.status(200).json({ accId: req.profile?.accId ?? null })
  })
  return app
}

async function send(app: express.Express, headers: Headers) {
  let request = supertest(app).get("/whoami")
  for (const [name, value] of Object.entries(headers)) {
    // superagent sends one header line per array item; its typings only
    // declare arrays for Cookie.
    request = Array.isArray(value)
      ? request.set(name as "Cookie", value)
      : request.set(name, value)
  }
  return request
}

const REJECTIONS: Record<string, [Headers, string]> = {
  missing_everything: [{}, "missing_profile"],
  missing_signature: [{ [DEFAULT_PROFILE_KEY]: VALID.profileHeader }, "missing_signature"],
  forged_profile: [
    {
      [DEFAULT_PROFILE_KEY]: vectorNamed("profile_appended_byte").profileHeader,
      [DEFAULT_PROFILE_SIGNATURE_KEY]: VALID.signature,
    },
    "profile_hash_mismatch",
  ],
  duplicate_signature: [
    { ...signed(), [DEFAULT_PROFILE_SIGNATURE_KEY]: [VALID.signature, VALID.signature] },
    "duplicate_header",
  ],
  duplicate_profile: [
    { ...signed(), [DEFAULT_PROFILE_KEY]: [VALID.profileHeader, VALID.profileHeader] },
    "duplicate_header",
  ],
  alg_none: [signed(vectorNamed("alg_none")), "unsupported_algorithm"],
  unknown_key: [signed(vectorNamed("unknown_key_version")), "unknown_key"],
  undecodable_profile: [signed(vectorNamed("profile_not_decodable")), "invalid_profile"],
}

describe.each(ENTRY_POINTS)("Express %s with verification enabled", (_name, factory) => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(VALID.nowSeconds * 1000)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(["development", "production"])(
    "accepts a gateway signature (%s)",
    async (environment) => {
      const calls = { count: 0 }
      const response = await send(buildApp(factory(environment, []), calls), signed())

      expect(response.status).toBe(200)
      expect(response.body).toEqual({ accId: ACCOUNT })
      expect(calls.count).toBe(1)
    }
  )

  it.each(["development", "production"].flatMap((environment) =>
    Object.entries(REJECTIONS).map(([name, rejection]) => [environment, name, rejection] as const)
  ))(
    "rejects %s %s without reaching the handler",
    async (environment, _case, [headers, reason]) => {
      const calls = { count: 0 }
      const reasons: string[] = []
      const response = await send(
        buildApp(factory(environment, reasons), calls),
        headers
      )

      expect(response.status).toBe(403)
      expect(response.body).toEqual({ detail: "Unable to verify Mycelium profile" })
      expect(calls.count).toBe(0)
      expect(reasons).toEqual([reason])
    }
  )

  it.each(["development", "production"])("internal clock failure returns generic 500 (%s)", async (environment) => {
    vi.spyOn(Date, "now").mockReturnValue(Number.NaN)
    const calls = { count: 0 }
    const reasons: string[] = []
    const response = await send(buildApp(factory(environment, reasons), calls), signed())
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ detail: "Unable to check user identity. Please contact administrators" })
    expect(calls.count).toBe(0)
    expect(reasons).toEqual(["internal_error"])
  })

  it("rejects an expired signature", async () => {
    vi.spyOn(Date, "now").mockReturnValue((VALID.nowSeconds + 61) * 1000)
    const calls = { count: 0 }
    const reasons: string[] = []

    const response = await send(buildApp(factory("production", reasons), calls), signed())

    expect(response.status).toBe(403)
    expect(reasons).toEqual(["timestamp_out_of_tolerance"])
    expect(calls.count).toBe(0)
  })
})

describe("Express factories read the environment at creation", () => {
  const variables = [
    "MYCELIUM_JWKS_URL",
    "MYCELIUM_JWKS_ALLOW_INSECURE_HTTP",
    "MYC_PROFILE_SIGNATURE_AUDIENCE",
  ]

  afterEach(() => {
    for (const variable of variables) delete process.env[variable]
    resetSharedProfileSignatureVerifier()
    vi.restoreAllMocks()
  })

  it.each([
    [{ MYCELIUM_JWKS_URL: "https://gateway.test/.well-known/mycelium-profile-jwks.json" }],
    [{ MYCELIUM_JWKS_URL: "http://gateway.test/.well-known/mycelium-profile-jwks.json", MYC_PROFILE_SIGNATURE_AUDIENCE: TEST_AUDIENCE }],
    [{ MYCELIUM_JWKS_URL: "not a url", MYC_PROFILE_SIGNATURE_AUDIENCE: TEST_AUDIENCE }],
  ])("invalid configuration throws when the middleware is created (%o)", (env) => {
    Object.assign(process.env, env)

    expect(() => profileMiddleware()).toThrow(ProfileSignatureConfigurationError)
    expect(() => getProfileFromHeaderRequired()).toThrow(
      ProfileSignatureConfigurationError
    )
  })

  it("configured environment enables verification", async () => {
    process.env.MYCELIUM_JWKS_URL = "https://gateway.test/.well-known/mycelium-profile-jwks.json"
    process.env.MYC_PROFILE_SIGNATURE_AUDIENCE = TEST_AUDIENCE
    const calls = { count: 0 }

    const response = await send(
      buildApp(profileMiddleware({ environment: "development" }), calls),
      { [DEFAULT_PROFILE_KEY]: VALID.profileHeader }
    )

    expect(response.status).toBe(403)
    expect(calls.count).toBe(0)
  })

  it("every factory call shares one key store per process", async () => {
    process.env.MYCELIUM_JWKS_URL = "https://gateway.test/.well-known/mycelium-profile-jwks.json"
    process.env.MYC_PROFILE_SIGNATURE_AUDIENCE = TEST_AUDIENCE
    vi.spyOn(Date, "now").mockReturnValue(VALID.nowSeconds * 1000)
    const fetchJwks = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JWKS_CONTRACT.published, {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    )
    const calls = { count: 0 }
    const app = express()
    for (const [path, handler] of [
      ["/a", profileMiddleware()],
      ["/b", profileMiddleware()],
      ["/c", getProfileFromHeaderRequired()],
    ] as const) {
      app.get(path, handler, (_req, res) => {
        calls.count += 1
        res.sendStatus(204)
      })
    }

    for (const path of ["/a", "/b", "/c"]) {
      const response = await supertest(app).get(path).set(signed() as Record<string, string>)
      expect(response.status).toBe(204)
    }

    expect(calls.count).toBe(3)
    expect(fetchJwks).toHaveBeenCalledTimes(1)
  })

  it("an explicit signatureVerifier wins over the shared one", async () => {
    process.env.MYCELIUM_JWKS_URL = "https://gateway.test/.well-known/mycelium-profile-jwks.json"
    process.env.MYC_PROFILE_SIGNATURE_AUDIENCE = "another-service"
    vi.spyOn(Date, "now").mockReturnValue(VALID.nowSeconds * 1000)
    profileMiddleware()
    const calls = { count: 0 }

    const response = await send(
      buildApp(profileMiddleware({ signatureVerifier: verifier() }), calls),
      signed()
    )

    expect(response.status).toBe(200)
    expect(calls.count).toBe(1)
  })

  it("without configuration the signature header is ignored", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const calls = { count: 0 }

    const response = await send(
      buildApp(profileMiddleware({ environment: "production" }), calls),
      { ...signed(), [DEFAULT_PROFILE_SIGNATURE_KEY]: "not-a-jws" }
    )

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ accId: ACCOUNT })
  })
})
