import { describe, expect, it } from "vitest"
import {
  Permission,
  PermissionSchema,
  permissionFromInt,
  permissionToInt,
} from "./permission.js"

describe("Permission", () => {
  it("maps READ=0 and WRITE=1", () => {
    expect(Permission.READ).toBe(0)
    expect(Permission.WRITE).toBe(1)
  })

  it("permissionToInt returns the raw int code", () => {
    expect(permissionToInt(Permission.READ)).toBe(0)
    expect(permissionToInt(Permission.WRITE)).toBe(1)
  })

  it("permissionFromInt maps back correctly", () => {
    expect(permissionFromInt(0)).toBe(Permission.READ)
    expect(permissionFromInt(1)).toBe(Permission.WRITE)
  })

  it("permissionFromInt throws on an invalid code", () => {
    expect(() => permissionFromInt(2)).toThrow()
    expect(() => permissionFromInt(-1)).toThrow()
  })

  it("PermissionSchema keeps numeric API codes and accepts Rust wire names", () => {
    expect(PermissionSchema.parse(0)).toBe(0)
    expect(PermissionSchema.parse(1)).toBe(1)
    expect(() => PermissionSchema.parse(2)).toThrow()
    expect(PermissionSchema.parse("read")).toBe(Permission.READ)
    expect(PermissionSchema.parse("write")).toBe(Permission.WRITE)
    for (const invalid of ["Read", "admin", "0", "1", null, true, -1]) {
      expect(() => PermissionSchema.parse(invalid)).toThrow()
    }
  })
})
