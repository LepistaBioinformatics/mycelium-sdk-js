import { describe, expect, it } from "vitest"
import { OwnerSchema } from "./owner.js"

const VALID = {
  id: "b6a1e6c2-6b1a-4b1a-9b1a-6b1a4b1a9b1a",
  email: "user@example.com",
  isPrincipal: true,
}

describe("OwnerSchema", () => {
  it("validates a minimal owner (only required fields)", () => {
    expect(OwnerSchema.parse(VALID)).toEqual(VALID)
  })

  it("validates a full owner with all optional fields", () => {
    const full = {
      ...VALID,
      firstName: "Jane",
      lastName: "Doe",
      username: "jane",
    }
    expect(OwnerSchema.parse(full)).toEqual(full)
  })

  it("rejects a missing id", () => {
    const { id: _id, ...rest } = VALID
    expect(() => OwnerSchema.parse(rest)).toThrow()
  })

  it("rejects a missing isPrincipal", () => {
    const { isPrincipal: _isPrincipal, ...rest } = VALID
    expect(() => OwnerSchema.parse(rest)).toThrow()
  })
})
