/** Shape of the OAuth 2.0 token endpoint response. */
interface TokenResponse {
   access_token: string
   token_type: string
   expires_in: number
   scope?: string
}

/** In-memory cache entry for a fetched access token. */
interface TokenCache {
   accessToken: string
   /** Epoch ms — when to attempt proactive refresh (before actual expiry). */
   refreshAt: number
   /** Epoch ms — actual token expiry. Never treat as expired before this. */
   expiresAt: number
   /** Granted scopes returned by the token endpoint, if any. */
   scope?: string
}

type RefreshCallback = (token: string) => void

/** Resolved credential after config validation — either a private key or a client secret. */
type ResolvedCredential =
   | { kind: "private_key_jwt", pem: string }
   | { kind: "client_secret_basic" | "client_secret_post", secret: string }

/** Outcome of a single token-request attempt: success cache, or a classified failure. */
type AttemptOutcome =
   | { cache: TokenCache }
   | { retryable: boolean, retryAfter: number | null, error: string }

/** Mutable per-provider state shared across the closure helpers. */
interface ProviderState {
   cache: TokenCache | null
   refreshPromise: Promise<string> | null
   /** In-flight initial `start()` promise; concurrent callers await this. */
   startPromise: Promise<void> | null
   refreshTimer: ReturnType<typeof setTimeout> | null
   privateKeyObj: Awaited<ReturnType<typeof import("jose").importPKCS8>> | null
   started: boolean
   refreshFailed: boolean
   refreshRetryMs: number
   readonly refreshCallbacks: Set<RefreshCallback>
}
