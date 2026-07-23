/** Fields common to every auth configuration. */
interface AuthConfigBase {
   /** App client_id registered with your FHIR authorization server */
   clientId: string
   /** OAuth 2.0 token endpoint URL */
   tokenEndpointUrl: string
   /** SMART scopes to request — space-delimited string or array */
   scopes: string | string[]
}

/** SMART Backend Services config: private-key JWT client assertion (RFC 7523). Default. */
interface PrivateKeyAuthConfig extends AuthConfigBase {
   /** Token-endpoint auth method. Omit or set explicitly for SMART Backend Services. */
   clientAuthMethod?: "private_key_jwt"
   /** RSA private key as PKCS#8 PEM text, a Buffer, or base64-encoded PEM */
   privateKey: string | Buffer
   /** Key ID — set when using a registered JWKS URL */
   keyId?: string
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
   /** Subscribe to token refreshes. Returns an unsubscribe function. */
   onRefresh(callback: (token: string) => void): () => void
   /** Returns the public JWKS derived from the private key. */
   getJwks(): Promise<JwkSet>
}

/** Getter-backed token response shape compatible with `fhirclient`'s request path. */
interface LiveTokenResponse {
   token_type: "bearer"
   readonly access_token: string | undefined
   readonly expires_in: number | undefined
   readonly scope: string | undefined
}
