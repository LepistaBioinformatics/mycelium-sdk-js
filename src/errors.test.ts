import { describe, expect, it } from "vitest"
import {
  InsufficientLicensesError,
  InsufficientPrivilegesError,
  MyceliumError,
  ProfileDecodingError,
} from "./errors.js"

describe("MyceliumError", () => {
  it("carries message, code and expTrue", () => {
    const err = new MyceliumError("boom", "MYC00099", true)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe("boom")
    expect(err.code).toBe("MYC00099")
    expect(err.expTrue).toBe(true)
  })

  it("defaults expTrue to false and code to undefined", () => {
    const err = new MyceliumError("boom")
    expect(err.code).toBeUndefined()
    expect(err.expTrue).toBe(false)
  })
})

describe("InsufficientPrivilegesError", () => {
  it("uses code MYC00019, expTrue true, and carries filteringState", () => {
    const err = new InsufficientPrivilegesError("no access", ["1:tenantId:t1"])
    expect(err).toBeInstanceOf(MyceliumError)
    expect(err.code).toBe("MYC00019")
    expect(err.expTrue).toBe(true)
    expect(err.filteringState).toEqual(["1:tenantId:t1"])
  })

  it("defaults filteringState to an empty array", () => {
    const err = new InsufficientPrivilegesError("no access")
    expect(err.filteringState).toEqual([])
  })
})

describe("InsufficientLicensesError", () => {
  it("uses code MYC00019, expTrue true, and a default message", () => {
    const err = new InsufficientLicensesError()
    expect(err).toBeInstanceOf(MyceliumError)
    expect(err.code).toBe("MYC00019")
    expect(err.expTrue).toBe(true)
    expect(err.message).toBe("Insufficient licenses to perform these action")
  })

  it("accepts a custom message", () => {
    const err = new InsufficientLicensesError("custom")
    expect(err.message).toBe("custom")
  })
})

describe("ProfileDecodingError", () => {
  it("uses code MYC00020 and expTrue false", () => {
    const err = new ProfileDecodingError("bad payload")
    expect(err).toBeInstanceOf(MyceliumError)
    expect(err.code).toBe("MYC00020")
    expect(err.expTrue).toBe(false)
    expect(err.message).toBe("bad payload")
  })
})
