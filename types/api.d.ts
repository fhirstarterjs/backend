/** Fields common to every auth configuration. */
interface AuthConfigBase {
   /** App client_id registered with your FHIR authorization server */
   clientId: string
   /** OAuth 2.0 token endpoint URL */
   tokenEndpointUrl: string
   /** SMART scopes to request — space-delimited string or array */
   scopes: string | string[]
   /** Optional shared store to coordinate token refresh across processes. */
   tokenStore?: TokenStore
   /** Per-attempt timeout in ms. Default 30000. */
   timeoutMs?: number
   /** Max token-request attempts (including the first). Default 3. */
   maxAttempts?: number
   /** Base backoff in ms between retries (exponential + jitter). Default 500. */
   backoffMs?: number
}

/** SMART Backend Services config: private-key JWT client assertion (RFC 7523). Default. */
interface PrivateKeyAuthConfig extends AuthConfigBase {
   /** Token-endpoint auth method. Omit or set explicitly for SMART Backend Services. */
   clientAuthMethod?: "private_key_jwt"
   /** Active signing key: PKCS#8 PEM text, a Buffer, or base64-encoded PEM (RSA or P-384 EC) */
   privateKey: string | Buffer
   /** Key ID for the active key. Defaults to its RFC 7638 thumbprint. */
   keyId?: string
   /**
    * Retired public keys to keep publishing in JWKS during rotation overlap. Each may be a
    * public or private PEM/Buffer/base64 (only public members are published). Never used to
    * sign. Retain through JWKS cache lifetime + max assertion lifetime, then remove.
    */
   retiredKeys?: (string | Buffer)[]
   /** JWK Set URL registered with your authorization server — included as `jku` in JWT header */
   jwksUrl?: string
   clientSecret?: never
}

/** Non-SMART OAuth compatibility config: shared client secret (Basic or POST body). */
interface SecretAuthConfig extends AuthConfigBase {
   /** Send the secret via HTTP Basic header or the request body. */
   clientAuthMethod: "client_secret_basic" | "client_secret_post"
   /** Shared client secret registered with your authorization server. */
   clientSecret: string
   privateKey?: never
   keyId?: never
   jwksUrl?: never
}

/** Configuration to authenticate with the token endpoint (discriminated by `clientAuthMethod`). */
type AuthConfig = PrivateKeyAuthConfig | SecretAuthConfig

/** Standard JWK Set structure — suitable for hosting at a public URL. */
interface JwkSet {
   /** Array of JSON Web Keys. */
   keys: import("jose").JWK[]
}

/** Auth lifecycle provider implemented by {@link fhirStarter}. */
interface Provider {
   /** Current valid token, or null if no unexpired token is cached. */
   readonly token: string | null
   /** Seconds until actual token expiry, or null if no valid token is cached. */
   readonly expiresIn: number | null
   /** `Bearer <token>` string, or null if no valid token is cached. */
   readonly authorizationHeader: string | null
   /** Fetch the first token and begin the proactive refresh loop. Safe to call once. */
   start(): Promise<void>
   /** Clear the proactive refresh timer. */
   stop(): void
   /** Returns a valid access token. Refreshes if past the refresh window; degrades gracefully on failure. */
   getAccessToken(): Promise<string>
   /** Returns a getter-backed token response object for use with official `fhirclient`. */
   tokenResponse(): LiveTokenResponse
   /**
    * Subscribe to token RE-acquisitions (not the initial token, store loads, or replays).
    * Returns an unsubscribe function.
    */
   onRefresh(callback: (token: string) => void): () => void
   /** Fires when a token request begins. Returns an unsubscribe function. */
   onRefreshStart(callback: () => void): () => void
   /** Fires when a token request ends (success or failure). Returns an unsubscribe function. */
   onRefreshEnd(callback: () => void): () => void
   /** Fires when a token request fails, with a redacted error. Returns an unsubscribe function. */
   onError(callback: (error: RefreshError) => void): () => void
   /** Returns the public JWKS derived from the private key. */
   getJwks(): Promise<JwkSet>
}

/** Redacted error payload for {@link Provider.onError} — never carries tokens or secrets. */
interface RefreshError {
   /** Safe, human-readable message with credentials/tokens stripped. */
   message: string
   /** HTTP status if the failure came from the token endpoint. */
   status?: number
}

/** Getter-backed token response shape compatible with `fhirclient`'s request path. */
interface LiveTokenResponse {
   token_type: "bearer"
   readonly access_token: string | undefined
   readonly expires_in: number | undefined
   readonly scope: string | undefined
}
