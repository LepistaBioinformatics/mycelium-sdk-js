import Fastify from "fastify"
import { describe, expect, it } from "vitest"
import {
  compressAndEncodeProfileToBase64,
} from "../functions/decodeAndDecompressProfileFromBase64.js"
import { Profile, ProfileSchema } from "../models/profile.js"
import { DEFAULT_PROFILE_KEY } from "../settings.js"
import { fastifyProfilePlugin } from "./index.js"

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

async function buildApp(environment: string) {
  const app = Fastify()
  await app.register(fastifyProfilePlugin, { environment })
  app.get("/whoami", async (request) => ({
    accId: request.profile?.accId ?? null,
  }))
  return app
}

describe("fastifyProfilePlugin", () => {
  it("sets request.profile on a valid header (prod)", async () => {
    const app = await buildApp("production")
    const encoded = compressAndEncodeProfileToBase64(validProfile())
    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { [DEFAULT_PROFILE_KEY]: encoded },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().accId).toBe(ACC_ID)
  })

  it("responds 403 when the header is missing in production", async () => {
    const app = await buildApp("production")
    const res = await app.inject({ method: "GET", url: "/whoami" })
    expect(res.statusCode).toBe(403)
    expect(res.json().detail).toContain(
      `Required header '${DEFAULT_PROFILE_KEY}' missing in production environment.`
    )
  })

  it("responds 401 when the header is invalid in production", async () => {
    const app = await buildApp("production")
    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { [DEFAULT_PROFILE_KEY]: "not-valid!!" },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().detail).toContain(
      "Unable to check user identity. Please contact administrators"
    )
  })

  it("sets request.profile to undefined (200) when the header is missing in development", async () => {
    const app = await buildApp("development")
    const res = await app.inject({ method: "GET", url: "/whoami" })
    expect(res.statusCode).toBe(200)
    expect(res.json().accId).toBeNull()
  })

  it("sets request.profile to undefined (200) when the header is invalid in development", async () => {
    const app = await buildApp("development")
    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { [DEFAULT_PROFILE_KEY]: "not-valid!!" },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().accId).toBeNull()
  })
})
