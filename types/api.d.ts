/** Fields common to every auth configuration. */
interface AuthConfigBase {
   /** FHIR base URL (server root) your client will call after auth */
   serverUrl: string
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

/** A retired signing key paired with the explicit `keyId` it was published under while active. */
interface RetiredKey {
   /** Public or private PEM/Buffer/base64 (only public members are published). */
   key: string | Buffer
   /** kid to publish for this key. Defaults to its RFC 7638 thumbprint when omitted. */
   keyId?: string
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
    * public or private PEM/Buffer/base64 (only public members are published), or a
    * {@link RetiredKey} pairing the key with an explicit `keyId` (to match a custom kid
    * scheme used when the key was active). Never used to sign. Retain through JWKS cache
    * lifetime + max assertion lifetime, then remove.
    */
   retiredKeys?: (string | Buffer | RetiredKey)[]
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
