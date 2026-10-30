import type { IncomingMessage } from "node:http"
import Fastify from "fastify"
import express from "express"
import supertest from "supertest"
import { afterEach, expect, it, vi } from "vitest"
import { loadProfileSignatureVerifierFromEnv } from "./profileSignatureConfig.js"
import { SIGNATURE_INTERNAL_DETAIL, verifyRequestProfile } from "./profileSignatureEnforcement.js"
import { fastifyProfilePlugin } from "./fastify/index.js"
import { getProfileFromHeaderRequired, profileMiddleware } from "./express/index.js"
import { environmentFor } from "./testdata/profileSignatureContract.js"

afterEach(() => vi.restoreAllMocks())

const listeners = [
  ["synchronous", () => { throw new Error("PRIVATE-DIAGNOSTIC-MARKER") }],
  ["asynchronous", async () => { throw new Error("PRIVATE-DIAGNOSTIC-MARKER") }],
] as const

it.each(listeners)("contains %s diagnostic callback failures in strict API", async (_name, listener) => {
  const verifier = loadProfileSignatureVerifierFromEnv(environmentFor(["1"]))!
  const request = { headers: {}, rawHeaders: [] } as unknown as IncomingMessage
  const result = await verifyRequestProfile(request, verifier, listener)
  expect(result).toEqual({ ok: false, status: 500, detail: SIGNATURE_INTERNAL_DETAIL })
})

it.each(["development", "production"].flatMap((environment) =>
  ["required", "middleware"].flatMap((entry) =>
    listeners.map(([name, listener]) => [environment, entry, name, listener] as const))
))("Express %s %s contains %s callback errors before handler", async (environment, entry, _name, listener) => {
  const app = express()
  const handler = vi.fn((_req: express.Request, res: express.Response) => res.json({ unexpected: true }))
  const options = { signatureVerifier: loadProfileSignatureVerifierFromEnv(environmentFor(["1"])), onSignatureRejected: listener }
  const middleware = entry === "required" ? getProfileFromHeaderRequired(options) : profileMiddleware({ ...options, environment })
  app.get("/whoami", middleware, handler)
  const response = await supertest(app).get("/whoami")
  expect(response.status).toBe(500)
  expect(response.body).toEqual({ detail: SIGNATURE_INTERNAL_DETAIL })
  expect(JSON.stringify(response.body)).not.toContain("PRIVATE-DIAGNOSTIC-MARKER")
  expect(handler).not.toHaveBeenCalled()
})

it.each(["development", "production"].flatMap((environment) =>
  listeners.map(([name, listener]) => [environment, name, listener] as const)
))("Fastify %s contains %s callback errors before handler", async (environment, _name, listener) => {
  const app = Fastify()
  const handler = vi.fn(() => ({ unexpected: true }))
  await app.register(fastifyProfilePlugin, {
    environment, signatureVerifier: loadProfileSignatureVerifierFromEnv(environmentFor(["1"])),
    onSignatureRejected: listener,
  })
  app.get("/whoami", handler)
  const response = await app.inject({ method: "GET", url: "/whoami" })
  expect(response.statusCode).toBe(500)
  expect(response.json()).toEqual({ detail: SIGNATURE_INTERNAL_DETAIL })
  expect(response.body).not.toContain("PRIVATE-DIAGNOSTIC-MARKER")
  expect(handler).not.toHaveBeenCalled()
  await app.close()
})
