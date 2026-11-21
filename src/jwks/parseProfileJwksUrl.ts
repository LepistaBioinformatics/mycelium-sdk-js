import { ProfileSignatureConfigurationError } from "../errors.js"
import { PROFILE_JWKS_PATH, PROFILE_JWKS_URL_ENV } from "../settings.js"

function invalid(problem: string): ProfileSignatureConfigurationError {
  return new ProfileSignatureConfigurationError(
    `${PROFILE_JWKS_URL_ENV} ${problem}`
  )
}

/** The configured value, with `https://` when it names no scheme. */
function withDefaultScheme(configured: string): string {
  if (configured.includes("://")) return configured
  if (configured === "" || configured.startsWith("/")) {
    throw invalid("is not an absolute URL")
  }
  return `https://${configured}`
}

function checkScheme(url: URL, allowInsecureHttp: boolean): void {
  if (url.protocol === "https:") return
  if (url.protocol === "http:" && allowInsecureHttp) {
    console.warn(
      `[mycelium-sdk] ${PROFILE_JWKS_URL_ENV} uses plain HTTP; development only`
    )
    return
  }
  throw invalid("must use https")
}

/** The complete endpoint as is, or the gateway base plus the JWKS path. */
function withJwksPath(url: URL): URL {
  if (url.pathname.endsWith(PROFILE_JWKS_PATH)) return url

  // `href` keeps an empty `?` or `#`, which `search` and `hash` hide.
  if (/[?#]/.test(url.href)) {
    throw invalid("must not carry a query or fragment")
  }

  try {
    return new URL(`${url.href.replace(/\/+$/, "")}${PROFILE_JWKS_PATH}`)
  } catch {
    throw invalid("is not an absolute URL")
  }
}

/**
 * Validate where the gateway profile JWKS is fetched from.
 *
 * The location comes only from the service configuration, never from a
 * request: following a URL found in the message being verified would let an
 * attacker choose the keys. `https:` is required; `http:` only with the
 * explicit development switch (a warning is logged).
 *
 * Two forms are accepted: the complete endpoint, ending in
 * `PROFILE_JWKS_PATH`, used as is; or the gateway base
 * (`mycelium.example.com`, `https://host/prefix`), to which
 * `PROFILE_JWKS_PATH` is appended. Without a scheme, `https://` is assumed.
 */
export function parseProfileJwksUrl(
  raw: string,
  allowInsecureHttp: boolean
): URL {
  let url: URL
  try {
    url = new URL(withDefaultScheme(raw.trim()))
  } catch (error) {
    if (error instanceof ProfileSignatureConfigurationError) throw error
    throw invalid("is not an absolute URL")
  }

  if (url.username !== "" || url.password !== "") {
    throw invalid("must not carry credentials")
  }

  checkScheme(url, allowInsecureHttp)
  return withJwksPath(url)
}
