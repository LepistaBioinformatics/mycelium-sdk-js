import { afterEach, describe, expect, it, vi } from "vitest"
import { ProfileSignatureError } from "../errors.js"
import { TEST_AUDIENCE, publicKeysFor, vectorNamed } from "../testdata/profileSignatureContract.js"
import type { ProfileJwksFetcher } from "./fetchProfileJwks.js"
import { JwksProfileSignatureVerifier } from "./jwksProfileSignatureVerifier.js"
import { ProfileKeyStore } from "./profileKeyStore.js"

/** A gateway stand-in whose published key set can change (or fail). */
class FakeGateway {
  published: string[] | undefined
  fetches = 0
  readonly maxAgeSeconds: number

  constructor(versions: string[], maxAgeSeconds = 600) {
    this.published = versions
    this.maxAgeSeconds = maxAgeSeconds
  }

  readonly fetcher: ProfileJwksFetcher = async () => {
    this.fetches += 1
    await Promise.resolve()
    if (this.published === undefined) throw new Error("gateway down")
    return { keys: publicKeysFor(this.published), maxAgeSeconds: this.maxAgeSeconds }
  }
}

const URL_ = new URL("https://gateway.test/jwks.json")

function verifierFor(gateway: FakeGateway, cooldownSeconds: number) {
  const store = new ProfileKeyStore(URL_, gateway.fetcher, cooldownSeconds)
  return new JwksProfileSignatureVerifier(store, 60, TEST_AUDIENCE)
}

/** `valid_v1` is signed by key 1; `valid_v2_during_rotation` by key 2. */
async function verify(verifier: JwksProfileSignatureVerifier, version: "1" | "2") {
  const vector = vectorNamed(version === "1" ? "valid_v1" : "valid_v2_during_rotation")
  return verifier.verifyAndDecode(vector.profileHeader, vector.signature, vector.nowSeconds)
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
    return "valid"
  } catch (error) {
    if (error instanceof ProfileSignatureError) return error.reason
    throw error
  }
}

afterEach(() => vi.restoreAllMocks())

describe("JwksProfileSignatureVerifier key cache", () => {
  it("picks up a rotation without restarting the downstream", async () => {
    const gateway = new FakeGateway(["1"])
    const verifier = verifierFor(gateway, 0)
    await verifier.prefetch()
    expect(await reasonOf(verify(verifier, "1"))).toBe("valid")

    gateway.published = ["1", "2"]

    expect(await reasonOf(verify(verifier, "2"))).toBe("valid")
    expect(gateway.fetches).toBe(2)
  })

  it("refetches on an unknown kid at most once per cooldown", async () => {
    const gateway = new FakeGateway(["1"])
    const verifier = verifierFor(gateway, 30)
    await verifier.prefetch()

    expect(await reasonOf(verify(verifier, "2"))).toBe("unknown_key")
    expect(await reasonOf(verify(verifier, "2"))).toBe("unknown_key")
    expect(gateway.fetches).toBe(1)
  })

  it("never refetches for a non-canonical kid", async () => {
    const gateway = new FakeGateway(["1"])
    const verifier = verifierFor(gateway, 0)
    await verifier.prefetch()
    const vector = vectorNamed("kid_not_canonical")

    const reason = await reasonOf(
      verifier.verifyAndDecode(vector.profileHeader, vector.signature, vector.nowSeconds)
    )

    expect(reason).toBe("unknown_key")
    expect(gateway.fetches).toBe(1)
  })

  it("shares one fetch between concurrent unknown kids", async () => {
    const gateway = new FakeGateway(["1"])
    const verifier = verifierFor(gateway, 0)
    await verifier.prefetch()
    gateway.published = ["1", "2"]

    const reasons = await Promise.all(
      Array.from({ length: 8 }, () => reasonOf(verify(verifier, "2")))
    )

    expect(reasons).toEqual(Array(8).fill("valid"))
    expect(gateway.fetches).toBe(2)
  })

  it("keeps the last valid set when a refresh fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    let now = 0
    const gateway = new FakeGateway(["1"], 60)
    const store = new ProfileKeyStore(URL_, gateway.fetcher, 0, () => now)
    const verifier = new JwksProfileSignatureVerifier(store, 60, TEST_AUDIENCE)
    await verifier.prefetch()

    gateway.published = undefined
    now = 61_000

    expect(await reasonOf(verify(verifier, "1"))).toBe("valid")
    expect(gateway.fetches).toBe(2)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("refresh_failed"))
  })

  it("refreshes an expired set", async () => {
    let now = 0
    const gateway = new FakeGateway(["1"], 60)
    const store = new ProfileKeyStore(URL_, gateway.fetcher, 30, () => now)
    const verifier = new JwksProfileSignatureVerifier(store, 60, TEST_AUDIENCE)
    await verifier.prefetch()

    now = 59_000
    await verify(verifier, "1")
    expect(gateway.fetches).toBe(1)

    now = 60_000
    await verify(verifier, "1")
    expect(gateway.fetches).toBe(2)
  })

  it("prefetch rejects when the gateway is unreachable", async () => {
    const gateway = new FakeGateway(["1"])
    gateway.published = undefined

    await expect(verifierFor(gateway, 0).prefetch()).rejects.toThrow("gateway down")
  })

  it("fetches lazily on first use when not prefetched", async () => {
    const gateway = new FakeGateway(["1"])
    const verifier = verifierFor(gateway, 30)

    expect(await reasonOf(verify(verifier, "1"))).toBe("valid")
    expect(gateway.fetches).toBe(1)
  })

  it("recovers within seconds when started before the gateway", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const gateway = new FakeGateway(["1"])
    gateway.published = undefined
    let now = 0
    const store = new ProfileKeyStore(URL_, gateway.fetcher, 30, () => now)
    const verifier = new JwksProfileSignatureVerifier(store, 60, TEST_AUDIENCE)
    expect(await reasonOf(verify(verifier, "1"))).toBe("unknown_key")

    gateway.published = ["1"]
    now = 4_999
    expect(await reasonOf(verify(verifier, "1"))).toBe("unknown_key")
    expect(gateway.fetches).toBe(1)

    now = 5_000
    expect(await reasonOf(verify(verifier, "1"))).toBe("valid")
    expect(gateway.fetches).toBe(2)
  })

  it("enforces the mandatory audience", async () => {
    const gateway = new FakeGateway(["1"])
    const store = new ProfileKeyStore(URL_, gateway.fetcher, 30)
    const verifier = new JwksProfileSignatureVerifier(store, 60, "reports-api")

    expect(await reasonOf(verify(verifier, "1"))).toBe("audience_mismatch")
  })
})
