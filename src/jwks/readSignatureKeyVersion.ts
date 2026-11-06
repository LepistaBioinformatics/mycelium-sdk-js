import { isCanonicalKeyVersion } from "../profileSignatureVerifier.js"

/**
 * The canonical key version named by a signature's protected header.
 *
 * Used only to decide whether an `unknown_key` rejection deserves a JWKS
 * refetch: a missing or non-canonical `kid` never triggers network work.
 */
export function readSignatureKeyVersion(
  signatureHeader: string
): string | undefined {
  const protectedHeader = signatureHeader.split(".")[0] ?? ""
  try {
    const header: unknown = JSON.parse(
      Buffer.from(protectedHeader, "base64url").toString("utf8")
    )
    const kid =
      typeof header === "object" && header !== null
        ? (header as Record<string, unknown>).kid
        : undefined
    return typeof kid === "string" && isCanonicalKeyVersion(kid)
      ? kid
      : undefined
  } catch {
    return undefined
  }
}
