# mycelium-sdk-js

Mycelium SDK for Node.js/TypeScript backends — decode the `x-mycelium-profile` header
injected by the Mycelium API Gateway and enforce tenant/account/role authorization with a
fluent, typed API.

Mirrors [`mycelium-sdk-py`](https://github.com/LepistaBioinformatics/mycelium-sdk-py) for
Python backends, with full parity against the gateway's Rust `core::Profile` (including
`permitFlags`/`denyFlags`, typed `AccountMetaKey`, and the tenant-wide/admin methods the
Python SDK doesn't expose).

## Requirements

- Node.js **>= 23.8.0** (needed for `node:zlib`'s native `zstdDecompressSync`/
  `zstdCompressSync` — the SDK has zero third-party zstd dependency)

## Install

```bash
# Core only (framework-agnostic)
yarn add @mycelium/mycelium-sdk

# With an Express adapter
yarn add @mycelium/mycelium-sdk express

# With a Fastify adapter
yarn add @mycelium/mycelium-sdk fastify
```

`express`/`fastify` are optional peer dependencies — the core package has no required
framework dependency. Import the adapter you need from its subpath:
`@mycelium/mycelium-sdk/express` or `@mycelium/mycelium-sdk/fastify`.

## Core usage

```ts
import { decodeAndDecompressProfileFromBase64 } from "@mycelium/mycelium-sdk"

const profile = decodeAndDecompressProfileFromBase64(headerValue)

const relatedAccounts = profile
  .withReadAccess()
  .onTenant(tenantId)
  .withRoles(["admin"])
  .onAccount(accountId)
  .getRelatedAccountOrError()
```

`decodeAndDecompressProfileFromBase64` throws `ProfileDecodingError` on any failure
(invalid base64, invalid zstd, invalid JSON, or schema validation failure). Prefer the
non-throwing variant if you'd rather branch on a result:

```ts
import { safeDecodeAndDecompressProfileFromBase64 } from "@mycelium/mycelium-sdk"

const result = safeDecodeAndDecompressProfileFromBase64(headerValue)
if (!result.success) {
  console.error(result.error.message)
} else {
  const profile = result.profile
}
```

## Express usage

```ts
import express from "express"
import { profileMiddleware } from "@mycelium/mycelium-sdk/express"

const app = express()
app.use(profileMiddleware())

app.get("/whoami", (req, res) => {
  res.json({ accId: req.profile?.accId ?? null })
})
```

`req.profile` is `Profile | undefined` in development (missing/invalid headers resolve to
`undefined` instead of failing the request) and always a valid `Profile` in production
(missing header → `403`, invalid header → `401`). Use `getProfileFromHeaderRequired()` as
route-level middleware when a route must always have a valid profile, regardless of
environment:

```ts
import { getProfileFromHeaderRequired } from "@mycelium/mycelium-sdk/express"

app.get("/admin", getProfileFromHeaderRequired(), (req, res) => {
  res.json({ accId: req.profile!.accId })
})
```

## Fastify usage

```ts
import Fastify from "fastify"
import { fastifyProfilePlugin } from "@mycelium/mycelium-sdk/fastify"

const app = Fastify()
await app.register(fastifyProfilePlugin)

app.get("/whoami", async (request) => ({
  accId: request.profile?.accId ?? null,
}))
```

Same environment-gated behavior as the Express adapter (`request.profile` is
`Profile | undefined`, with the same 403/401/500 status codes in production).

## Error handling

All SDK errors extend `MyceliumError` (`message`, `code`, `expTrue`):

| Error | Code | Thrown by |
|---|---|---|
| `ProfileDecodingError` | `MYC00020` | `decodeAndDecompressProfileFromBase64` on any decode/validation failure |
| `InsufficientLicensesError` | `MYC00019` | `getRelatedAccountOrError()` when licensed resources are present but empty |
| `InsufficientPrivilegesError` | `MYC00019` | Any fluent method that requires a privilege the profile lacks (carries `filteringState` for debugging) |

## License

Apache-2.0
