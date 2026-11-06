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
yarn add @lepistabioinformatics/mycelium-sdk

# With an Express adapter
yarn add @lepistabioinformatics/mycelium-sdk express

# With a Fastify adapter
yarn add @lepistabioinformatics/mycelium-sdk fastify
```

`express`/`fastify` are optional peer dependencies — the core package has no required
framework dependency. Import the adapter you need from its subpath:
`@lepistabioinformatics/mycelium-sdk/express` or `@lepistabioinformatics/mycelium-sdk/fastify`.

## Core usage

```ts
import { decodeAndDecompressProfileFromBase64 } from "@lepistabioinformatics/mycelium-sdk"

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
import { safeDecodeAndDecompressProfileFromBase64 } from "@lepistabioinformatics/mycelium-sdk"

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
import { profileMiddleware } from "@lepistabioinformatics/mycelium-sdk/express"

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
import { getProfileFromHeaderRequired } from "@lepistabioinformatics/mycelium-sdk/express"

app.get("/admin", getProfileFromHeaderRequired(), (req, res) => {
  res.json({ accId: req.profile!.accId })
})
```

## Fastify usage

```ts
import Fastify from "fastify"
import { fastifyProfilePlugin } from "@lepistabioinformatics/mycelium-sdk/fastify"

const app = Fastify()
await app.register(fastifyProfilePlugin)

app.get("/whoami", async (request) => ({
  accId: request.profile?.accId ?? null,
}))
```

Same environment-gated behavior as the Express adapter (`request.profile` is
`Profile | undefined`, with the same 403/401/500 status codes in production).

## Profile signature verification (opt-in)

When the gateway is configured with `[core.profileSigning]`, it adds
`x-mycelium-profile-signature` to every request that carries
`x-mycelium-profile`: a compact JWS (`alg: EdDSA`, `kid: <key version>`) over
`{iat, ph, aud}`, where `ph` is the SHA-256 of the exact profile header and
`aud` the downstream service name. The gateway publishes its public keys as a
JWKS at `/.well-known/mycelium-profile-jwks.json`; this SDK downloads them
(Node's built-in `fetch`), caches them and verifies every signature locally.

> **Rollout order is mandatory.** Confirm the gateway in front of this service
> is already signing **before** setting `MYCELIUM_JWKS_URL` here. A service
> that verifies behind a gateway that does not sign rejects every request
> (403). To roll back, unset `MYCELIUM_JWKS_URL` here first, then disable
> signing in the gateway.

Point the SDK at the gateway JWKS before creating the middleware or
registering the plugin:

```bash
export MYCELIUM_JWKS_URL="https://gateway.internal/.well-known/mycelium-profile-jwks.json"
export MYC_PROFILE_SIGNATURE_AUDIENCE=billing-api   # required: this service's name in the gateway
export MYC_PROFILE_SIGNATURE_TOLERANCE_SECONDS=60   # optional, default 60
# export MYCELIUM_JWKS_ALLOW_INSECURE_HTTP=true     # local development only (http:// URL)
```

The environment is read once, when `profileMiddleware()` /
`getProfileFromHeaderRequired()` are called or `fastifyProfilePlugin` is
registered. Invalid configuration (non-`https` URL without the development
switch, URL with credentials, missing audience, invalid tolerance) throws
`ProfileSignatureConfigurationError` there, so the application does not
start. Load `.env` files before that point.

**When the keys are downloaded:** on the first signed request, in both
Express and Fastify. Requests only reach this service through the gateway, so
when one arrives the gateway (and its JWKS) is up: the service never depends
on the gateway to start, and the two can be started in any order. Until the
keys are downloaded, requests fail closed (403) and the download is retried at
most every 5 seconds.

To download the keys at startup instead (and refuse to start when the
gateway keys cannot be fetched), prepare the verifier yourself and pass it in
(`fastifyProfilePlugin` takes the same `signatureVerifier` option):

```ts
import { prepareProfileSignatureVerifier } from "@lepistabioinformatics/mycelium-sdk"

// validates the settings and downloads the JWKS; rejects with
// ProfileJwksFetchError when the keys cannot be downloaded
const signatureVerifier = await prepareProfileSignatureVerifier()
app.use(profileMiddleware({ signatureVerifier }))
```

With verification enabled, the Express middlewares and the Fastify plugin
verify before decoding and answer **403** `Unable to verify Mycelium profile`
on signature rejection, in every environment (the development leniency never
applies). Duplicate headers are rejected. `next()` / the route handler only
run after the signature is accepted. Unexpected internal failures return generic
500 without invoking the handler. Without `MYCELIUM_JWKS_URL` nothing changes,
except that a signed profile logs one `console.warn` per process
(`MYCELIUM_JWKS_URL` is not set, so nothing is verified). Tolerance must be a
positive safe integer (<= 9007199254740991).

Key handling follows the gateway contract (`jwks-vectors.json`):

- the set is cached for the `max-age` sent by the gateway (bounded to
  1 minute..1 day, 12 hours when absent), then refreshed;
- a signature with an unknown `kid` triggers one refetch, at most every
  30 seconds and shared by concurrent requests, so gateway key rotation needs
  no change or restart here;
- if a refresh fails, the last valid set is kept and the failure is logged
  (`console.warn`, prefixed `[mycelium-sdk]`);
- the fetch is bounded (5 seconds, 64 KiB, redirects never followed) and a
  set with private material, another key type, a wrong key length or a
  non-canonical/repeated `kid` is refused as a whole.

The JWKS URL comes only from configuration, never from a request.

```ts
app.use(
  profileMiddleware({
    // optional: observe rejections (log-safe reason, never the token)
    onSignatureRejected: (reason) => logger.warn({ reason }, "profile rejected"),
  })
)
```

Custom integrations can use the verifier directly. It is asynchronous: always
`await` it. `decodeAndDecompressProfileFromBase64` does **not** verify:

```ts
import { prepareProfileSignatureVerifier } from "@lepistabioinformatics/mycelium-sdk"

const verifier = await prepareProfileSignatureVerifier() // once, at startup
if (!verifier) throw new Error("Profile verification must be configured for this service")
const profile = await verifier.verifyAndDecode(profileHeader, signatureHeader)
```

Diagnostic callbacks may return a promise. The SDK awaits it and contains both
synchronous exceptions and promise rejections, returning generic 500 without
executing the handler. Keep application callbacks bounded.

Limits (by design): a captured valid pair can be replayed to the same service
during the tolerance window; only `x-mycelium-profile` is signed. Mount the
middleware only on routes that require a profile.

Rust wire permissions `"read"` / `"write"` are accepted and normalized to the
SDK's existing numeric `Permission.READ = 0` / `Permission.WRITE = 1` API.
The optional Rust `verboseStatus: null` is accepted without weakening enum checks.

## Error handling

All SDK errors extend `MyceliumError` (`message`, `code`, `expTrue`), except
`ProfileJwksFetchError` (a plain `Error`, raised when the gateway JWKS cannot be
downloaded):

| Error | Code | Thrown by |
|---|---|---|
| `ProfileSignatureError` | `MYC_PROFILE_SIGNATURE_INVALID` | `verifyProfileSignature` / `verifyAndDecodeProfile` (carries a log-safe `reason`) |
| `ProfileSignatureConfigurationError` | `MYC_PROFILE_SIGNATURE_CONFIG_INVALID` | Invalid `MYCELIUM_JWKS_*` / `MYC_PROFILE_SIGNATURE_*` setting, or an unsafe JWKS |
| `ProfileDecodingError` | `MYC00020` | `decodeAndDecompressProfileFromBase64` on any decode/validation failure |
| `InsufficientLicensesError` | `MYC00019` | `getRelatedAccountOrError()` when licensed resources are present but empty |
| `InsufficientPrivilegesError` | `MYC00019` | Any fluent method that requires a privilege the profile lacks (carries `filteringState` for debugging) |

## License

Apache-2.0
