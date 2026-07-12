import { describe, expect, it } from "vitest"
import { ProfileDecodingError } from "../errors.js"
import { Profile, ProfileSchema } from "../models/profile.js"
import {
  compressAndEncodeProfileToBase64,
  decodeAndDecompressProfileFromBase64,
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
    owners: [{ id: ACC_ID, email: "user@example.com", isPrincipal: true }],
    licensedResources: {
      records: [
        {
          accId: ACC_ID,
          sysAcc: false,
          tenantId: "c2b26c3a-7c2a-4c2a-8c2a-7c2a4c2a8c2a",
          accName: "acc-1",
          role: "admin",
          roleId: "d3c37c4a-8d3a-4d3a-9d3a-8d3a4d3a9d3a",
          perm: 1,
          verified: true,
        },
      ],
    },
  })
  return Profile.fromValidated(data)
}

describe("decodeAndDecompressProfileFromBase64", () => {
  it("round-trips a compressed profile back to a deep-equal Profile", () => {
    const original = buildProfile()
    const encoded = compressAndEncodeProfileToBase64(original)
    const decoded = decodeAndDecompressProfileFromBase64(encoded)
    expect(decoded.data).toEqual(original.data)
  })

  it("accepts a Buffer as input in addition to a string", () => {
    const original = buildProfile()
    const encoded = compressAndEncodeProfileToBase64(original)
    const decoded = decodeAndDecompressProfileFromBase64(
      Buffer.from(encoded, "utf-8")
    )
    expect(decoded.data).toEqual(original.data)
  })

  it("throws ProfileDecodingError on invalid base64", () => {
    expect(() => decodeAndDecompressProfileFromBase64("not-valid-base64!!")).toThrow(
      ProfileDecodingError
    )
  })

  it("throws ProfileDecodingError on an empty string", () => {
    expect(() => decodeAndDecompressProfileFromBase64("")).toThrow(
      ProfileDecodingError
    )
  })

  it("throws ProfileDecodingError on valid base64 but invalid zstd when strict (default)", () => {
    const plainJsonBase64 = Buffer.from(
      JSON.stringify({ not: "a profile" }),
      "utf-8"
    ).toString("base64")

    expect(() =>
      decodeAndDecompressProfileFromBase64(plainJsonBase64)
    ).toThrow(ProfileDecodingError)
  })

  it("falls back to plain JSON when strict: false and zstd decompression fails", () => {
    const original = buildProfile()
    const plainJsonBase64 = Buffer.from(
      JSON.stringify(original.data),
      "utf-8"
    ).toString("base64")

    const decoded = decodeAndDecompressProfileFromBase64(plainJsonBase64, {
      strict: false,
    })
    expect(decoded.data).toEqual(original.data)
  })

  it("throws ProfileDecodingError when the decompressed JSON fails schema validation", () => {
    const invalidJsonBase64 = Buffer.from(
      JSON.stringify({ not: "a profile" }),
      "utf-8"
    ).toString("base64")

    expect(() =>
      decodeAndDecompressProfileFromBase64(invalidJsonBase64, {
        strict: false,
      })
    ).toThrow(ProfileDecodingError)
  })
})
