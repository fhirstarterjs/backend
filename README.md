# 🔥 fhirstarterjs

SMART on FHIR Backend Services auth lifecycle for any FHIR client.

## Install

```sh
npm install fhirstarterjs
```

## Usage

This example uses the official `fhirclient` package as the FHIR client; `fhirstarterjs` only manages auth.

```ts
import FHIR from "fhirclient"
import FHIRStarter from "fhirstarterjs"

const auth = new FHIRStarter({
   clientId: "your-client-id",
   privateKey: "./privatekey.pem",
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

`auth.start()` fetches the first token and starts the proactive refresh loop. `auth.tokenResponse()` returns a live getter-backed object — `fhirclient` reads `access_token` dynamically per request, so it always picks up the latest token.

`fhirstarterjs` does not fetch FHIR resources and does not bundle a FHIR client. It manages the auth lifecycle; the FHIR client does the rest.

`privateKey` can be PEM text, a `Buffer` from `readFileSync`, or a path to a PKCS#8 PEM file.

## TypeScript types

If needed, you can import the public types directly from the shipped type folder:

```ts
import type { AuthConfig, JwkSet, LiveTokenResponse, Provider } from "fhirstarterjs/types/api"
```

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

`new FHIRStarter(config)`

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

`getJwks()` strips private key material — host the output JSON at your registered JWKS URL and pass that URL as `jwksUrl` so the JWT `jku` header is set automatically.

## JWKS

Some SMART Backend Services registrations require a public JWKS URL when using `jku`. Generate it from the same private key you use for auth:

```ts
import { writeFileSync } from "node:fs"
import FHIRStarter from "fhirstarterjs"

const auth = new FHIRStarter({
   clientId: "your-client-id",
   privateKey: "./privatekey.pem",
   tokenEndpointUrl: "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token",
   scopes: ["system/Patient.rs"],
   keyId: "my-key-id",
   jwksUrl: "https://example.com/.well-known/jwks.json",
})

// No need to call auth.start() — getJwks() only needs the private key.
const jwks = await auth.getJwks()
writeFileSync("./jwks.json", JSON.stringify(jwks, null, 3))
```

Host `jwks.json` at the exact URL you register with your authorization server, then pass that URL as `jwksUrl`. If you set `keyId`, the generated key includes `kid`, and signed JWTs use the same `kid` header.

## Compatibility

`tokenResponse()` is designed for `fhirclient.request()`. If a client copies the token at construction time rather than reading it per-request, use `onRefresh()` to update or recreate that client instead. If `fhirclient` clears its internal state after a 401, recreate the client instance with `auth.tokenResponse()`.

## Scripts

| Command | What |
|---|---|
| `npm run check` | `tsc --noEmit` |
| `npm run build` | Compile to `dist/` (JS only — no `.d.ts`) |

## Notes

- Call `auth.start()` to fetch the first token and begin the proactive refresh loop — call `auth.stop()` during shutdown in long-running processes
- Tokens are cached with separate refresh and expiry timestamps — if a refresh fails but the token is not yet expired, the old token remains usable
- Concurrent callers share a single in-flight token refresh
- JWT assertions are signed RS384, expire after 5 minutes
- Requires Node 20+, a PKCS#8 RSA key, and SMART Backend Services scopes
