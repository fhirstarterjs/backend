/** Auth lifecycle provider implemented by {@link fhirStarter}. */
interface Provider {
   /** FHIR base URL supplied in config — the server your client calls. */
   readonly serverUrl: string
   /** Current valid access token, or null if no unexpired token is cached. */
   readonly accessToken: string | null
   /** Epoch ms of actual token expiry, or null if no valid token is cached. */
   readonly expiresAt: number | null
   /** Alias of {@link Provider.accessToken}. Current valid token, or null. */
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
    * Fresh writable `ClientState` for `FHIR.client(...)`. The outer object is writable so
    * `fhirclient` may reassign `tokenResponse` on a 401; the nested value is live.
    */
   readonly fhirClient: FhirClientState
   /** Current `{ Authorization }` for `fetch`, or `{}` when no valid token. */
   readonly authHeaders: AuthHeaders
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
   /** Run local, offline config validation (no network). Returns collected problems. */
   validate(): ValidationResult
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

/** Result of local, offline {@link Provider.validate} — no network calls. */
interface ValidationResult {
   /** True when no problems were found. */
   ok: boolean
   /** Human-readable problem descriptions (empty when `ok`). */
   problems: string[]
}

/** Getter-backed token response shape compatible with `fhirclient`'s request path. */
interface LiveTokenResponse {
   token_type: "bearer"
   readonly access_token: string | undefined
   readonly expires_in: number | undefined
   readonly scope: string | undefined
}

/** Minimal `fhirclient` `ClientState` spread into `FHIR.client(...)` (structural, no dep). */
interface FhirClientState {
   serverUrl: string
   tokenResponse: LiveTokenResponse
}

/** Fetch-ready headers: `{ Authorization }` when authed, else empty. */
type AuthHeaders = Record<string, string>
