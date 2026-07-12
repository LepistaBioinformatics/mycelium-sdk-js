import { describe, expect, it } from "vitest"
import { ProfileDecodingError } from "../errors.js"
import { Profile, ProfileSchema } from "../models/profile.js"
import {
  compressAndEncodeProfileToBase64,
  safeDecodeAndDecompressProfileFromBase64,
} from "./decodeAndDecompressProfileFromBase64.js"

const ACC_ID = "b6a1e6c2-6b1a-4b1a-9b1a-6b1a4b1a9b1a"

function buildProfile(): Profile {
  const data = ProfileSchema.parse({
    accId: ACC_ID,
    isSubscription: false,
    isStaff: false,
    isManager: false,
    ownerIsActive: true,
    accountIsActive: true,
    accountWasApproved: true,
    accountWasArchived: false,
    accountWasDeleted: false,
    owners: [],
  })
  return Profile.fromValidated(data)
}

describe("safeDecodeAndDecompressProfileFromBase64", () => {
  it("returns {success: true, profile} without throwing on valid input", () => {
    const encoded = compressAndEncodeProfileToBase64(buildProfile())
    const result = safeDecodeAndDecompressProfileFromBase64(encoded)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.profile.accId).toBe(ACC_ID)
    }
  })

  it("returns {success: false, error} instead of throwing on invalid input", () => {
    const result = safeDecodeAndDecompressProfileFromBase64("not-valid!!")
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ProfileDecodingError)
    }
  })

  it("produces a readable, non-raw-Zod-dump message on validation failure", () => {
    const invalidJsonBase64 = Buffer.from(
      JSON.stringify({ not: "a profile" }),
      "utf-8"
    ).toString("base64")

    const result = safeDecodeAndDecompressProfileFromBase64(
      invalidJsonBase64,
      { strict: false }
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.message).toContain("field")
      expect(result.error.message).not.toContain("ZodError")
      expect(result.error.message).not.toContain("[object Object]")
    }
  })
})
