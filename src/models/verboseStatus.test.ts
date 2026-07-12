import { describe, expect, it } from "vitest"
import { VerboseStatusSchema } from "./verboseStatus.js"

describe("VerboseStatusSchema", () => {
  it("accepts all 6 variants", () => {
    for (const value of [
      "unverified",
      "verified",
      "inactive",
      "archived",
      "deleted",
      "unknown",
    ]) {
      expect(VerboseStatusSchema.parse(value)).toBe(value)
    }
  })

  it("rejects an invalid string", () => {
    expect(() => VerboseStatusSchema.parse("bogus")).toThrow()
  })
})
