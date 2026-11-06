import express from "express"
import supertest from "supertest"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { profileMiddleware } from "./express/index.js"
import { resetSignatureIgnoredWarning } from "./profileSignatureEnforcement.js"
import { DEFAULT_PROFILE_KEY, DEFAULT_PROFILE_SIGNATURE_KEY } from "./settings.js"
import { vectorNamed } from "./testdata/profileSignatureContract.js"

const VALID = vectorNamed("valid_v1")

beforeEach(() => {
  resetSignatureIgnoredWarning()
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => vi.restoreAllMocks())

function app() {
  const server = express()
  server.get("/whoami", profileMiddleware({ environment: "production" }), (_req, res) => {
    res.json({ ok: true })
  })
  return server
}

it("warns once per process when a signed profile arrives without MYCELIUM_JWKS_URL", async () => {
  const server = app()
  for (let index = 0; index < 3; index += 1) {
    await supertest(server)
      .get("/whoami")
      .set(DEFAULT_PROFILE_KEY, VALID.profileHeader)
      .set(DEFAULT_PROFILE_SIGNATURE_KEY, VALID.signature)
  }

  expect(console.warn).toHaveBeenCalledTimes(1)
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("MYCELIUM_JWKS_URL is not set"))
})

it("stays silent for unsigned profiles", async () => {
  await supertest(app()).get("/whoami").set(DEFAULT_PROFILE_KEY, VALID.profileHeader)

  expect(console.warn).not.toHaveBeenCalled()
})
