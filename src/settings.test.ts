import { describe, expect, it } from "vitest"
import {
  DEFAULT_CONNECTION_STRING_KEY,
  DEFAULT_EMAIL_KEY,
  DEFAULT_MYCELIUM_ROLE_KEY,
  DEFAULT_PROFILE_KEY,
  DEFAULT_REQUEST_ID_KEY,
  DEFAULT_SCOPE_KEY,
  DEFAULT_TENANT_ID_KEY,
} from "./settings.js"

describe("header key constants", () => {
  it("matches the gateway's lib/http_tools/src/settings.rs values", () => {
    expect(DEFAULT_PROFILE_KEY).toBe("x-mycelium-profile")
    expect(DEFAULT_EMAIL_KEY).toBe("x-mycelium-email")
    expect(DEFAULT_SCOPE_KEY).toBe("x-mycelium-scope")
    expect(DEFAULT_MYCELIUM_ROLE_KEY).toBe("x-mycelium-role")
    expect(DEFAULT_REQUEST_ID_KEY).toBe("x-mycelium-request-id")
    expect(DEFAULT_CONNECTION_STRING_KEY).toBe("x-mycelium-connection-string")
    expect(DEFAULT_TENANT_ID_KEY).toBe("x-mycelium-tenant-id")
  })
})
