import type { KeyObject } from "node:crypto"
import {
  PROFILE_JWKS_FETCH_TIMEOUT_SECONDS,
  PROFILE_JWKS_MAX_BYTES,
} from "../settings.js"
import { parseProfileJwks } from "./parseProfileJwks.js"
import { readJwksCacheMaxAge } from "./readJwksCacheMaxAge.js"

/** A key set read from the gateway, with how long it may be cached. */
export interface FetchedProfileJwks {
  keys: ReadonlyMap<string, KeyObject>
  maxAgeSeconds: number
}

/** How the key store downloads the JWKS (HTTP in production, fakes in tests). */
export type ProfileJwksFetcher = (url: URL) => Promise<FetchedProfileJwks>

export class ProfileJwksFetchError extends Error {
  constructor(problem: string) {
    super(`profile_jwks_fetch_failed: ${problem}`)
    this.name = "ProfileJwksFetchError"
  }
}

async function readBounded(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0")
  if (declared > PROFILE_JWKS_MAX_BYTES) {
    throw new ProfileJwksFetchError("body exceeds the size limit")
  }

  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of response.body ?? []) {
    total += chunk.byteLength
    if (total > PROFILE_JWKS_MAX_BYTES) {
      throw new ProfileJwksFetchError("body exceeds the size limit")
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}

async function download(url: URL): Promise<Response> {
  try {
    return await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(PROFILE_JWKS_FETCH_TIMEOUT_SECONDS * 1000),
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new ProfileJwksFetchError(`request failed: ${detail}`)
  }
}

/**
 * Download and parse the gateway profile JWKS over HTTP.
 *
 * Bounded: 5 s timeout, 64 KiB body, redirects never followed (a redirect
 * could move the trust anchor to another origin). The cache lifetime comes
 * from `Cache-Control: max-age` (see `readJwksCacheMaxAge`).
 */
export const fetchProfileJwks: ProfileJwksFetcher = async (url) => {
  const response = await download(url)
  if (response.status < 200 || response.status > 299) {
    await response.body?.cancel()
    throw new ProfileJwksFetchError(`status ${response.status}`)
  }

  const maxAgeSeconds = readJwksCacheMaxAge(response.headers.get("cache-control"))
  let body: string
  try {
    body = await readBounded(response)
  } catch (error) {
    await response.body?.cancel().catch(() => undefined)
    if (error instanceof ProfileJwksFetchError) throw error
    throw new ProfileJwksFetchError("body unreadable")
  }

  return { keys: parseProfileJwks(body), maxAgeSeconds }
}
