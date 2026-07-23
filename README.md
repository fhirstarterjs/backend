# @fhirstarter/backend

[![npm](https://img.shields.io/npm/v/@fhirstarter/backend)](https://www.npmjs.com/package/@fhirstarter/backend)
[![CI](https://github.com/fhirstarterjs/backend/actions/workflows/ci.yml/badge.svg)](https://github.com/fhirstarterjs/backend/actions/workflows/ci.yml)
[![Publish](https://github.com/fhirstarterjs/backend/actions/workflows/publish.yml/badge.svg)](https://github.com/fhirstarterjs/backend/actions/workflows/publish.yml)

SMART on FHIR **Backend Services** (client credentials) auth lifecycle for any
FHIR client. It handles the JWT client assertion, JWKS derivation, and automatic
proactive token refresh — while staying client-agnostic, so you keep using
`fhirclient`, `fhir-kit-client`, or raw `fetch`.

> Launching from an EHR instead? See the sister project
> **[@fhirstarter/ehr](https://github.com/fhirstarterjs/ehr)** — a turnkey SMART
> **EHR-launch** wrapper with Vue/React components.


## Contents

- [Install](#install)
- [Usage](#usage)
- [Other FHIR clients](#other-fhir-clients)
- [API](#api)
- [Thumbprint](#thumbprint)
- [JWKS](#jwks)
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
   clientId: "your-client-id",
   privateKey: process.env.FHIR_PRIVATE_KEY!, // base64-encoded PKCS#8 PEM
   tokenEndpointUrl: "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token",
   scopes: ["system/Patient.rs", "system/Observation.rs"],
})

await auth.start()

const client = FHIR.client({
   serverUrl: "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4",
   tokenResponse: auth.tokenResponse(),
})

const bundle = await client.request("Patient?family=Smith")
```

`auth.start()` fetches the first token and starts the proactive refresh loop.
`auth.tokenResponse()` returns a live getter-backed object — `fhirclient` reads
`access_token` dynamically per request, so it always picks up the latest token.

`fhirStarter` does not fetch FHIR resources and does not bundle a FHIR client. It
manages the auth lifecycle; the FHIR client does the rest.

`privateKey` can be PKCS#8 PEM text, a `Buffer`, or a base64-encoded PEM string
(the preferred form for environment variables). File paths are not supported.

## Other FHIR clients

For clients with a bearer token setter (e.g. `fhir-kit-client`):

```ts
const unsubscribe = auth.onRefresh((token) => {
   client.bearerToken = token
})
```

For raw `fetch` or any other HTTP client:

```ts
const token = await auth.getAccessToken()
const res = await fetch(url, {
   headers: { Authorization: `Bearer ${token}` },
})
```

## API

`fhirStarter(config)` — returns a provider (no `new`)

| Member | Returns | Description |
|---|---|---|
| `start()` | `Promise<void>` | Fetch first token and begin proactive refresh loop |
| `stop()` | `void` | Clear the refresh timer |
| `token` | `string \| null` | Current valid token, or null if expired |
| `expiresIn` | `number \| null` | Seconds until actual expiry, or null |
| `authorizationHeader` | `string \| null` | `Bearer <token>` or null |
| `getAccessToken()` | `Promise<string>` | Async valid token with lazy refresh |
| `tokenResponse()` | `LiveTokenResponse` | Getter-backed token response for `fhirclient` |
| `onRefresh(callback)` | `() => void` | Subscribe to token updates — returns unsubscribe |
| `getJwks()` | `Promise<JwkSet>` | Public JWKS derived from the private key |
| `fhirStarter.thumbprint(privateKey)` | `string` | RFC 7638 JWK Thumbprint (base64url SHA-256) |

`getJwks()` strips private key material — host the output JSON at your registered
JWKS URL and pass that URL as `jwksUrl` so the JWT `jku` header is set
automatically.

## Thumbprint

Derive a deterministic `kid` from a private key without instantiating the class:

```ts
import fhirStarter from "@fhirstarter/backend"

const kid = fhirStarter.thumbprint(pemOrBuffer)
console.log(kid) // base64url SHA-256 of the canonical public JWK (RSA or EC)
```

This implements RFC 7638 — the SHA-256 of the sorted canonical JWK members
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

// No need to call auth.start() — getJwks() only needs the private key.
const jwks = await auth.getJwks()
writeFileSync("./jwks.json", JSON.stringify(jwks, null, 3))
```

Host `jwks.json` at the exact URL you register with your authorization server,
then pass that URL as `jwksUrl`. If you set `keyId`, the generated key includes
`kid`, and signed JWTs use the same `kid` header.

## Compatibility

`tokenResponse()` is designed for `fhirclient.request()`. If a client copies the
token at construction time rather than reading it per-request, use `onRefresh()`
to update or recreate that client instead. If `fhirclient` clears its internal
state after a 401, recreate the client instance with `auth.tokenResponse()`.

## Scripts

| Command | What |
|---|---|
| `npm run check` | `tsc --noEmit` |
| `npm run build` | Compile to `dist/` |

## Notes

- Call `auth.start()` to fetch the first token and begin the proactive refresh
  loop — call `auth.stop()` during shutdown in long-running processes
- Tokens are cached with separate refresh and expiry timestamps — if a refresh
  fails but the token is not yet expired, the old token remains usable
- Concurrent callers share a single in-flight token refresh
- JWT assertions are signed RS384 (RSA) or ES384 (P-384 EC), expire after 5 minutes
- Requires Node 20+, a PKCS#8 RSA or P-384 EC key, and SMART Backend Services scopes
