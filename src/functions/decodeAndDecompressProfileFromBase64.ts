import { zstdCompressSync, zstdDecompressSync } from "node:zlib"
import { ProfileDecodingError } from "../errors.js"
import { Profile, ProfileSchema } from "../models/profile.js"

export interface DecodeOptions {
  strict?: boolean
}

export function decodeAndDecompressProfileFromBase64(
  input: string | Buffer,
  opts: DecodeOptions = {}
): Profile {
  const strict = opts.strict ?? true

  if (
    (typeof input === "string" && input.length === 0) ||
    (Buffer.isBuffer(input) && input.length === 0)
  ) {
    throw new ProfileDecodingError("Profile input is empty")
  }

  const inputBytes = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input, "utf-8")

  const base64Text = inputBytes.toString("utf-8")
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Text) || base64Text.length % 4 !== 0) {
    throw new ProfileDecodingError(
      `Failed to decode base64 profile: not valid base64`
    )
  }

  let decoded: Buffer
  try {
    decoded = Buffer.from(base64Text, "base64")
  } catch (cause) {
    throw new ProfileDecodingError(`Failed to decode base64 profile: ${cause}`)
  }

  let decompressed: Buffer
  try {
    decompressed = zstdDecompressSync(decoded)
  } catch (cause) {
    if (strict) {
      throw new ProfileDecodingError(
        `Failed to decompress zstd profile: ${cause}`
      )
    }
    decompressed = decoded
  }

  let profileString: string
  try {
    profileString = decompressed.toString("utf-8")
  } catch (cause) {
    throw new ProfileDecodingError(
      `Failed to convert decompressed profile to string: ${cause}`
    )
  }

  let profileJson: unknown
  try {
    profileJson = JSON.parse(profileString)
  } catch (cause) {
    throw new ProfileDecodingError(`Failed to deserialize profile: ${cause}`)
  }

  const result = ProfileSchema.safeParse(profileJson)
  if (!result.success) {
    throw new ProfileDecodingError(
      `Failed to deserialize profile: ${formatZodError(result.error)}`
    )
  }

  return Profile.fromValidated(result.data)
}

export type SafeDecodeResult =
  | { success: true; profile: Profile }
  | { success: false; error: ProfileDecodingError }

export function safeDecodeAndDecompressProfileFromBase64(
  input: string | Buffer,
  opts: DecodeOptions = {}
): SafeDecodeResult {
  try {
    const profile = decodeAndDecompressProfileFromBase64(input, opts)
    return { success: true, profile }
  } catch (error) {
    if (error instanceof ProfileDecodingError) {
      return { success: false, error }
    }
    return {
      success: false,
      error: new ProfileDecodingError(String(error)),
    }
  }
}

export function compressAndEncodeProfileToBase64(profile: Profile): string {
  const json = JSON.stringify(profile.data)
  const compressed = zstdCompressSync(Buffer.from(json, "utf-8"))
  return compressed.toString("base64")
}

function formatZodError(error: {
  issues: { path: (string | number)[]; message: string }[]
}): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)"
      return `field '${path}' ${issue.message}`
    })
    .join("; ")
}
