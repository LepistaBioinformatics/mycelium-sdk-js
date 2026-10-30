import type { IncomingMessage } from "node:http"
import { ProfileSignatureError } from "./errors.js"
import { verifyAndDecodeProfile } from "./functions/verifyProfileSignature.js"
import type { Profile } from "./models/profile.js"
import type { ProfileSignatureVerifier } from "./profileSignatureConfig.js"
import {
  DEFAULT_PROFILE_KEY,
  DEFAULT_PROFILE_SIGNATURE_KEY,
} from "./settings.js"

export const SIGNATURE_REJECTION_DETAIL = "Unable to verify Mycelium profile"
export const SIGNATURE_INTERNAL_DETAIL =
  "Unable to check user identity. Please contact administrators"

/** Log-safe reason only. Result ignored; returned promises are awaited safely. */
export type SignatureRejectionListener = (reason: string) => unknown

async function reportRejection(
  listener: SignatureRejectionListener | undefined,
  reason: string
): Promise<boolean> {
  try {
    await listener?.(reason)
    return true
  } catch {
    return false
  }
}

export type SignatureVerificationOutcome =
  | { ok: true; profile: Profile }
  | { ok: false; status: 403 | 500; detail: string }

function singleValue(
  values: string[] | undefined,
  missingReason: "missing_profile" | "missing_signature"
): string {
  if (values !== undefined && values.length > 1) {
    throw new ProfileSignatureError("duplicate_header")
  }

  const value = values?.[0]
  if (value === undefined || value === "") {
    throw new ProfileSignatureError(missingReason)
  }

  return value
}

/**
 * Every value of a header, as received.
 *
 * `IncomingMessage.headers` joins repeated custom headers with ", ", which
 * would hide a duplicate; `headersDistinct` keeps each occurrence. Request
 * shims that lack it (for example Fastify's `inject`) fall back to
 * `rawHeaders`, then to `headers`.
 */
function receivedValues(
  message: IncomingMessage,
  name: string
): string[] | undefined {
  const distinct = (message.headersDistinct as
    | NodeJS.Dict<string[]>
    | undefined)?.[name]
  if (distinct !== undefined) return distinct

  const raw: unknown = message.rawHeaders
  if (Array.isArray(raw) && raw.length > 0) {
    const values = raw.filter(
      (_value, index) =>
        index % 2 === 1 && String(raw[index - 1]).toLowerCase() === name
    ) as string[]
    return values.length === 0 ? undefined : values
  }

  const value = message.headers[name]
  if (value === undefined) return undefined
  return Array.isArray(value) ? value : [value]
}

function distinctValues(
  message: IncomingMessage,
  name: string
): string[] | undefined {
  // Neither Base64 nor a compact JWS contains ",": a comma can only come
  // from repeated headers joined by the runtime or a proxy.
  return receivedValues(message, name)?.flatMap((value) =>
    value.split(",").map((part) => part.trim())
  )
}

/**
 * Authenticate and decode the profile carried by a request.
 *
 * Never throws: rejections map to 403, anything unexpected to 500, both with
 * generic details. The caller must not run the handler unless `ok`.
 */
export async function verifyRequestProfile(
  message: IncomingMessage,
  verifier: ProfileSignatureVerifier,
  onRejected?: SignatureRejectionListener
): Promise<SignatureVerificationOutcome> {
  try {
    const profileHeader = singleValue(
      distinctValues(message, DEFAULT_PROFILE_KEY),
      "missing_profile"
    )
    const signatureHeader = singleValue(
      distinctValues(message, DEFAULT_PROFILE_SIGNATURE_KEY),
      "missing_signature"
    )
    const profile = await verifyAndDecodeProfile(
      profileHeader,
      signatureHeader,
      verifier
    )
    return { ok: true, profile }
  } catch (error) {
    if (error instanceof ProfileSignatureError) {
      if (!(await reportRejection(onRejected, error.reason))) {
        return { ok: false, status: 500, detail: SIGNATURE_INTERNAL_DETAIL }
      }
      return { ok: false, status: 403, detail: SIGNATURE_REJECTION_DETAIL }
    }
    await reportRejection(onRejected, "internal_error")
    return { ok: false, status: 500, detail: SIGNATURE_INTERNAL_DETAIL }
  }
}
