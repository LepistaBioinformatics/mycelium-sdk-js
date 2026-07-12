import express from "express"
import supertest from "supertest"
import { describe, expect, it } from "vitest"
import {
  compressAndEncodeProfileToBase64,
} from "../functions/decodeAndDecompressProfileFromBase64.js"
import { Profile, ProfileSchema } from "../models/profile.js"
import { DEFAULT_PROFILE_KEY } from "../settings.js"
import {
  getProfileFromHeaderRequired,
  profileMiddleware,
} from "./index.js"

const ACC_ID = "b6a1e6c2-6b1a-4b1a-9b1a-6b1a4b1a9b1a"

function validProfile(): Profile {
  const data = ProfileSchema.parse({
    accId: ACC_ID,
    isSubscription: false,
    isStaff: false,
    isManager: false,
    ownerIsActive: true,
    accountIsActive: true,
    accountWasApproved: true,
    accountWasArchived: false,
    accountWasDeleted: false,
    owners: [],
  })
  return Profile.fromValidated(data)
}

function buildApp(environment: string) {
  const app = express()
  app.use(profileMiddleware({ environment }))
  app.get("/whoami", (req, res) => {
    res.status(200).json({ accId: req.profile?.accId ?? null })
  })
  return app
}

function buildRequiredApp() {
  const app = express()
  app.get("/whoami", getProfileFromHeaderRequired(), (req, res) => {
    res.status(200).json({ accId: req.profile?.accId ?? null })
  })
  return app
}

describe("profileMiddleware", () => {
  it("sets req.profile on a valid header (prod)", async () => {
    const encoded = compressAndEncodeProfileToBase64(validProfile())
    const res = await supertest(buildApp("production"))
      .get("/whoami")
      .set(DEFAULT_PROFILE_KEY, encoded)
    expect(res.status).toBe(200)
    expect(res.body.accId).toBe(ACC_ID)
  })

  it("responds 403 when the header is missing in production", async () => {
    const res = await supertest(buildApp("production")).get("/whoami")
    expect(res.status).toBe(403)
    expect(res.body.detail).toContain(
      `Required header '${DEFAULT_PROFILE_KEY}' missing in production environment.`
    )
  })

  it("responds 401 when the header is invalid in production", async () => {
    const res = await supertest(buildApp("production"))
      .get("/whoami")
      .set(DEFAULT_PROFILE_KEY, "not-valid!!")
    expect(res.status).toBe(401)
    expect(res.body.detail).toContain(
      "Unable to check user identity. Please contact administrators"
    )
  })

  it("sets req.profile to undefined (200) when the header is missing in development", async () => {
    const res = await supertest(buildApp("development")).get("/whoami")
    expect(res.status).toBe(200)
    expect(res.body.accId).toBeNull()
  })

  it("sets req.profile to undefined (200) when the header is invalid in development", async () => {
    const res = await supertest(buildApp("development"))
      .get("/whoami")
      .set(DEFAULT_PROFILE_KEY, "not-valid!!")
    expect(res.status).toBe(200)
    expect(res.body.accId).toBeNull()
  })
})

describe("getProfileFromHeaderRequired", () => {
  it("sets req.profile on a valid header regardless of environment", async () => {
    const encoded = compressAndEncodeProfileToBase64(validProfile())
    const res = await supertest(buildRequiredApp())
      .get("/whoami")
      .set(DEFAULT_PROFILE_KEY, encoded)
    expect(res.status).toBe(200)
    expect(res.body.accId).toBe(ACC_ID)
  })

  it("responds 401 when the header is missing", async () => {
    const res = await supertest(buildRequiredApp()).get("/whoami")
    expect(res.status).toBe(401)
  })

  it("responds 401 when the header is invalid", async () => {
    const res = await supertest(buildRequiredApp())
      .get("/whoami")
      .set(DEFAULT_PROFILE_KEY, "not-valid!!")
    expect(res.status).toBe(401)
  })
})
