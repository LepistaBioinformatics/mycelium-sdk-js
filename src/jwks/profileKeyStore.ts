import type { KeyObject } from "node:crypto"
import type { ProfileJwksFetcher } from "./fetchProfileJwks.js"
import {
  PROFILE_JWKS_EMPTY_RETRY_SECONDS,
  PROFILE_JWKS_MAX_STALE_SECONDS,
} from "../settings.js"

/** Milliseconds clock, injectable for tests. */
export type MonotonicClock = () => number

const systemClock: MonotonicClock = () => performance.now()

export interface CachedProfileKeys {
  keys: ReadonlyMap<string, KeyObject>
  generation: number
}

/**
 * The gateway public keys cached by a downstream verifier.
 *
 * - Fetched lazily on the first request (default) or before serving
 *   (`prefetch`, opt-in). Until a set is downloaded, requests fail closed and
 *   the fetch is retried at most every `PROFILE_JWKS_EMPTY_RETRY_SECONDS`, so
 *   a service started before the gateway recovers within seconds.
 * - Refreshed when `max-age` expires; a failed refresh keeps the last valid
 *   set and logs a warning, so a short gateway outage never drops trusted
 *   keys. The set stops being trusted `PROFILE_JWKS_MAX_STALE_SECONDS` after
 *   it expired, so a retired key cannot verify forever while refreshes fail.
 * - A request never waits for a refresh another request already started
 *   while keys are cached: it verifies with the cached set.
 * - Refetched once when a signature names an unknown `kid`, at most once per
 *   cooldown (measured from the end of the last attempt), and single-flight:
 *   concurrent requests share one fetch, and waiters that see a newer
 *   generation reuse it without fetching again.
 */
export class ProfileKeyStore {
  readonly #url: URL
  readonly #fetcher: ProfileJwksFetcher
  readonly #cooldownMs: number
  readonly #clock: MonotonicClock
  #keys: ReadonlyMap<string, KeyObject> = new Map()
  #generation = 0
  #freshUntil: number | undefined
  #lastAttempt: number | undefined
  #inFlight: Promise<boolean> | undefined

  constructor(
    url: URL,
    fetcher: ProfileJwksFetcher,
    cooldownSeconds: number,
    clock: MonotonicClock = systemClock
  ) {
    this.#url = url
    this.#fetcher = fetcher
    this.#cooldownMs = cooldownSeconds * 1000
    this.#clock = clock
  }

  get url(): URL {
    return new URL(this.#url)
  }

  /** The trusted keys now, and the generation they belong to. */
  current(): CachedProfileKeys {
    return { keys: this.#trustedKeys(), generation: this.#generation }
  }

  /** The cached keys, or none once they outlived the maximum staleness. */
  #trustedKeys(): ReadonlyMap<string, KeyObject> {
    const outlived =
      this.#freshUntil !== undefined &&
      this.#clock() >= this.#freshUntil + PROFILE_JWKS_MAX_STALE_SECONDS * 1000
    return outlived ? new Map() : this.#keys
  }

  /** Fetch the set now; any failure rejects (startup must abort). */
  async prefetch(): Promise<void> {
    await this.#inFlight?.catch(() => undefined)
    const fetching = this.#fetchAndStore()
    this.#inFlight = fetching.then(
      () => true,
      () => false
    )
    try {
      await fetching
    } finally {
      this.#inFlight = undefined
    }
  }

  /** Refresh when the cached set expired (or was never fetched). */
  async refreshIfStale(): Promise<void> {
    const stale =
      this.#freshUntil === undefined || this.#clock() >= this.#freshUntil
    if (!stale) return
    if (this.#generation > 0 && this.#inFlight !== undefined) return
    await this.#refreshFrom(this.#generation)
  }

  /** Refetch after an unknown `kid`; `true` when newer keys are available. */
  refreshAfterUnknownKey(seenGeneration: number): Promise<boolean> {
    return this.#refreshFrom(seenGeneration)
  }

  async #refreshFrom(seenGeneration: number): Promise<boolean> {
    while (this.#inFlight !== undefined) {
      await this.#inFlight.catch(() => undefined)
    }

    if (this.#generation !== seenGeneration) return true
    const coolingDown =
      this.#lastAttempt !== undefined &&
      this.#clock() - this.#lastAttempt < this.#retryIntervalMs()
    if (coolingDown) return false

    this.#inFlight = this.#fetchAndStore().then(
      () => true,
      (error: unknown) => {
        logRefreshFailure(error)
        return false
      }
    )
    try {
      return await this.#inFlight
    } finally {
      this.#inFlight = undefined
    }
  }

  /** The cooldown, shortened while no key set was ever stored. */
  #retryIntervalMs(): number {
    if (this.#generation > 0) return this.#cooldownMs
    return Math.min(this.#cooldownMs, PROFILE_JWKS_EMPTY_RETRY_SECONDS * 1000)
  }

  async #fetchAndStore(): Promise<void> {
    let fetched
    try {
      fetched = await this.#fetcher(new URL(this.#url))
    } finally {
      this.#lastAttempt = this.#clock()
    }

    this.#keys = new Map(fetched.keys)
    this.#generation += 1
    this.#freshUntil = this.#clock() + fetched.maxAgeSeconds * 1000
  }
}

function logRefreshFailure(error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error)
  console.warn(
    `[mycelium-sdk] profile_signature.jwks outcome=refresh_failed reason=${reason}; keeping the last valid profile JWKS`
  )
}
