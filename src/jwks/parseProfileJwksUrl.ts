import { ProfileSignatureConfigurationError } from "../errors.js"
import { PROFILE_JWKS_URL_ENV } from "../settings.js"

function invalid(problem: string): ProfileSignatureConfigurationError {
  return new ProfileSignatureConfigurationError(
    `${PROFILE_JWKS_URL_ENV} ${problem}`
  )
}

/**
 * Validate where the gateway profile JWKS is fetched from.
 *
 * The location comes only from the service configuration, never from a
 * request: following a URL found in the message being verified would let an
 * attacker choose the keys. `https:` is required; `http:` only with the
 * explicit development switch (a warning is logged).
 */
export function parseProfileJwksUrl(
  raw: string,
  allowInsecureHttp: boolean
): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw invalid("is not an absolute URL")
  }

  if (url.username !== "" || url.password !== "") {
    throw invalid("must not carry credentials")
  }

  if (url.protocol === "https:") return url
  if (url.protocol === "http:" && allowInsecureHttp) {
    console.warn(
      `[mycelium-sdk] ${PROFILE_JWKS_URL_ENV} uses plain HTTP; development only`
    )
    return url
  }
  throw invalid("must use https")
}
