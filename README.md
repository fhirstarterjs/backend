# @fhirstarter/backend

[![npm](https://img.shields.io/npm/v/@fhirstarter/backend)](https://www.npmjs.com/package/@fhirstarter/backend)
[![CI](https://github.com/fhirstarterjs/backend/actions/workflows/ci.yml/badge.svg)](https://github.com/fhirstarterjs/backend/actions/workflows/ci.yml)
[![Publish](https://github.com/fhirstarterjs/backend/actions/workflows/publish.yml/badge.svg)](https://github.com/fhirstarterjs/backend/actions/workflows/publish.yml)

The server-side half of `@fhirstarter`: a SMART on FHIR **Backend Services**
(client credentials) auth engine. It owns the JWT client assertion, JWKS
derivation, and a proactive refresh loop that keeps a valid token ready at all
times, then stays out of your way. Because it never touches FHIR itself, the
result is a flat handoff you spread into whatever client you already use:
`FHIR.client(auth.fhirClient)`, `auth.authHeaders` for `fetch`, or
`auth.onRefresh(...)` to feed `fhir-kit-client`.

> Launching from an EHR instead? See the sister project
> **[@fhirstarter/ehr](https://github.com/fhirstarterjs/ehr)**, a turnkey SMART
> **EHR-launch** wrapper with Vue/React components.


## Contents

- [Install](#install)
- [Usage](#usage)
- [Other FHIR clients](#other-fhir-clients)
- [API](#api)
- [Thumbprint](#thumbprint)
- [JWKS](#jwks)
- [Key rotation](#key-rotation)
- [Shared token store](#shared-token-store)
- [Transport & retries](#transport--retries)
- [Events](#events)
- [Validation](#validation)
- [Compatibility](#compatibility)
- [Scripts](#scripts)
- [Notes](#notes)

## Install

```sh
npm install @fhirstarter/backend
```

## Usage

This example uses the official `fhirclient` package as the FHIR client;
`fhirStarter` only manages auth.

```ts
import FHIR from "fhirclient"
import fhirStarter from "@fhirstarter/backend"

const auth = fhirStarter({
   serverUrl: "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4",
   clientId: "your-client-id",
   privateKey: process.env.FHIR_PRIVATE_KEY!, // base64-encoded PKCS#8 PEM
   tokenEndpointUrl: "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token",
   scopes: ["system/Patient.rs", "system/Observation.rs"],
})

await auth.start()

const client = FHIR.client(auth.fhirClient)

const bundle = await client.request("Patient?family=Smith")
```

`auth.start()` fetches the first token and starts the proactive refresh loop.
`auth.fhirClient` is a ready-to-spread `FHIR.client(...)` argument built from your
`serverUrl` and a live `tokenResponse`, so `fhirclient` always reads the latest
token per request.

`fhirStarter` does not fetch FHIR resources and does not bundle a FHIR client. It
manages the auth lifecycle; the FHIR client does the rest.

`privateKey` can be PKCS#8 PEM text, a `Buffer`, or a base64-encoded PEM string
(the preferred form for environment variables). File paths are not supported.

## Other FHIR clients

For raw `fetch` or any HTTP client, spread the current auth headers:

```ts
const res = await fetch(`${auth.serverUrl}/Patient?family=Smith`, {
   headers: auth.authHeaders,
})
```

`auth.authHeaders` is `{ Authorization: "Bearer <token>" }` when a valid token is
cached, or `{}` otherwise. Read it per request so it always reflects the latest
token. `auth.accessToken` and `auth.expiresAt` (epoch ms) expose the raw values.

For clients with a bearer token setter (e.g. `fhir-kit-client`):

```ts
const unsubscribe = auth.onRefresh((token) => {
   client.bearerToken = token
})
```

## API

`fhirStarter(config)` returns a provider (no `new`)

| Member | Returns | Description |
|---|---|---|
| `start()` | `Promise<void>` | Fetch first token and begin proactive refresh loop |
| `stop()` | `void` | Clear the refresh timer |
| `serverUrl` | `string` | FHIR base URL from config |
| `accessToken` | `string \| null` | Current valid token, or null if expired |
| `expiresAt` | `number \| null` | Epoch ms of actual expiry, or null |
| `token` | `string \| null` | Alias of `accessToken` |
| `expiresIn` | `number \| null` | Seconds until actual expiry, or null |
| `authorizationHeader` | `string \| null` | `Bearer <token>` or null |
| `getAccessToken()` | `Promise<string>` | Async valid token with lazy refresh |
| `tokenResponse()` | `LiveTokenResponse` | Getter-backed token response for `fhirclient` |
| `fhirClient` | `FhirClientState` | Spread into `FHIR.client(...)`; writable outer, live token |
| `authHeaders` | `AuthHeaders` | `{ Authorization }` for `fetch`, or `{}` when no token |
| `onRefresh(callback)` | `() => void` | Subscribe to token **re-acquisitions**; returns unsubscribe |
| `onRefreshStart(callback)` | `() => void` | Fires when a token request begins |
| `onRefreshEnd(callback)` | `() => void` | Fires when a token request ends (success or failure) |
| `onError(callback)` | `() => void` | Fires on failure with a redacted `RefreshError` |
| `validate()` | `ValidationResult` | Offline config check returning `{ ok, problems }` (no network) |
| `getJwks()` | `Promise<JwkSet>` | Public JWKS derived from the private key |
| `fhirStarter.thumbprint(privateKey)` | `string` | RFC 7638 JWK Thumbprint (base64url SHA-256) |

`getJwks()` strips private key material; host the output JSON at your registered
JWKS URL and pass that URL as `jwksUrl` so the JWT `jku` header is set
automatically.

## Thumbprint

Derive a deterministic `kid` from a private key without instantiating the class:

```ts
import fhirStarter from "@fhirstarter/backend"

const kid = fhirStarter.thumbprint(pemOrBuffer)
console.log(kid) // base64url SHA-256 of the canonical public JWK (RSA or EC)
```

This implements RFC 7638: the SHA-256 of the sorted canonical JWK members
(`{e, kty, n}` for RSA, `{crv, kty, x, y}` for EC), base64url-encoded. Use it as
the `keyId` when registering your JWKS.

## JWKS

Some SMART Backend Services registrations require a public JWKS URL when using
`jku`. Generate it from the same private key you use for auth:

```ts
import { writeFileSync } from "node:fs"
import fhirStarter from "@fhirstarter/backend"

const auth = fhirStarter({
   clientId: "your-client-id",
   privateKey: process.env.FHIR_PRIVATE_KEY!, // base64-encoded PKCS#8 PEM
   tokenEndpointUrl: "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token",
   scopes: ["system/Patient.rs"],
   keyId: "my-key-id",
   jwksUrl: "https://example.com/.well-known/jwks.json",
})

// No need to call auth.start(); getJwks() only needs the private key.
const jwks = await auth.getJwks()
writeFileSync("./jwks.json", JSON.stringify(jwks, null, 3))
```

Host `jwks.json` at the exact URL you register with your authorization server,
then pass that URL as `jwksUrl`. If you set `keyId`, the generated key includes
`kid`, and signed JWTs use the same `kid` header. If you omit `keyId`, the `kid`
defaults to the key's RFC 7638 thumbprint.

## Key rotation

To rotate without downtime, publish the new key alongside the old one during an
overlap window. Set the new key as `privateKey` (signing switches to it
immediately) and list the previous key in `retiredKeys` so `getJwks()` keeps
publishing its public JWK for verifiers that cached the old JWKS:

```ts
const auth = fhirStarter({
   clientId: "your-client-id",
   privateKey: process.env.FHIR_NEW_KEY!,      // active, signs all assertions
   retiredKeys: [process.env.FHIR_OLD_KEY!],   // publish-only, never signs
   tokenEndpointUrl: "https://auth.example/token",
   scopes: ["system/Patient.rs"],
})
```

Sequence: publish the successor in JWKS → wait through the JWKS cache lifetime →
make it active → keep the retired key through the cache lifetime plus the max
assertion lifetime (5 min), then drop it from `retiredKeys`. Each key is
published under its own `kid` (its thumbprint unless overridden).

If a retired key was published under a custom `kid` while active, pass it as a
`{ key, keyId }` pair so `getJwks()` republishes it under the same `kid`
(otherwise it falls back to the thumbprint):

```ts
retiredKeys: [{ key: process.env.FHIR_OLD_KEY!, keyId: "old-kid" }],
```

## Shared token store

By default each provider refreshes independently. When you run several processes
under the same client identity, pass a `tokenStore` so they coordinate: only one
process fetches a token at a time (via an owner-scoped lease) and the others
adopt the shared result, avoiding refresh storms.

```ts
const auth = fhirStarter({
   clientId: "your-client-id",
   privateKey: process.env.FHIR_PRIVATE_KEY!,
   tokenEndpointUrl: "https://auth.example/token",
   scopes: ["system/Patient.rs"],
   tokenStore: myRedisStore, // implements the TokenStore interface
})
```

`fhirStarter.memoryStore()` is a single-process reference implementation (handy
for tests). For real multi-process coordination, supply a store backed by Redis,
a database, or similar. The store contract requires atomic, owner-scoped leases
and a `setUnderLease` that writes only while the caller still holds the lease.

## Transport & retries

Token requests retry transient failures with exponential backoff and jitter.
Only network errors and HTTP 408/429/5xx are retried; permanent 4xx such as
`invalid_client` or `invalid_scope` fail immediately. A `Retry-After` header is
honored when present. Each retry builds a fresh JWT assertion (new `jti`).

Tune via config: `timeoutMs` (per-attempt, default 30000), `maxAttempts`
(default 3), and `backoffMs` (base delay, default 500).

## Events

`onRefresh(cb)` fires only when a **new** token is acquired after the first,
not on the initial `start()`, a shared-store load, or a late subscription. Use
it to push tokens into clients that cache them:

```ts
auth.onRefresh((token) => (client.bearerToken = token))
```

`onRefreshStart` / `onRefreshEnd` bracket each token request; `onError` delivers
a redacted `RefreshError` (`{ message, status? }`) that never contains tokens or
secrets. All four return an unsubscribe function, and listener exceptions never
break the auth lifecycle.

## Validation

`auth.validate()` runs a fast, offline check of the config: HTTPS token
endpoint, non-empty scopes, key parsing, supported algorithm (RS384/ES384), and
unique `kid`s across active and retired keys. It makes no network calls and
returns `{ ok, problems }`:

```ts
const { ok, problems } = auth.validate()
if (!ok) throw new Error(`Invalid config: ${problems.join("; ")}`)
```

Actual credential/scope acceptance can only be proven by a real token request,
so treat a successful `start()` as the true integration check.

## Compatibility

`fhirClient` and `tokenResponse()` are designed for `fhirclient.request()`, which
reads the token per request. If a client copies the token at construction time
instead, use `onRefresh()` to update or recreate that client. If `fhirclient`
clears its internal state after a 401, recreate the client with `auth.fhirClient`.

## Scripts

| Command | What |
|---|---|
| `npm run check` | `tsc --noEmit` |
| `npm run build` | Compile to `dist/` |

## Notes

- Call `auth.start()` to fetch the first token and begin the proactive refresh
  loop; call `auth.stop()` during shutdown in long-running processes
- Tokens are cached with separate refresh and expiry timestamps; if a refresh
  fails but the token is not yet expired, the old token remains usable
- Concurrent callers share a single in-flight token refresh
- JWT assertions are signed RS384 (RSA) or ES384 (P-384 EC), expire after 5 minutes
- Requires Node 20+, a PKCS#8 RSA or P-384 EC key, and SMART Backend Services scopes
