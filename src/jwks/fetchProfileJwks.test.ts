import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { JWKS_CONTRACT } from "../testdata/profileSignatureContract.js"
import { fetchProfileJwks } from "./fetchProfileJwks.js"

let server: Server
let base: string

beforeAll(async () => {
  server = createServer((request, response) => {
    switch (request.url) {
      case "/jwks.json":
        response.writeHead(200, {
          "content-type": "application/json",
          "cache-control": "public, max-age=600",
        })
        response.end(JWKS_CONTRACT.published)
        return
      case "/huge.json":
        // Chunked, no content-length: the limit must hold while streaming.
        response.writeHead(200, { "content-type": "application/json" })
        for (let index = 0; index < 70; index += 1) response.write(" ".repeat(1024))
        response.end()
        return
      case "/redirect.json":
        response.writeHead(302, { location: "/jwks.json" })
        response.end()
        return
      default:
        response.writeHead(404)
        response.end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe("fetchProfileJwks over HTTP", () => {
  it("fetches the set and its cache lifetime", async () => {
    const fetched = await fetchProfileJwks(new URL(`${base}/jwks.json`))

    expect([...fetched.keys.keys()]).toEqual(["1", "2"])
    expect(fetched.maxAgeSeconds).toBe(600)
  })

  it.each(["/missing.json", "/huge.json", "/redirect.json"])(
    "refuses %s",
    async (path) => {
      await expect(fetchProfileJwks(new URL(`${base}${path}`))).rejects.toThrow(
        /profile_jwks_fetch_failed/
      )
    }
  )

  it("refuses an unreachable gateway", async () => {
    await expect(
      fetchProfileJwks(new URL("http://127.0.0.1:1/jwks.json"))
    ).rejects.toThrow(/profile_jwks_fetch_failed: request failed/)
  })
})
