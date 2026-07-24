/** Ready auth provider returned by {@link fhirStarter}. */
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
   /** Subscribe to successful token acquisitions after the first, including later shared-store adoption. */
   onRefresh(callback: (token: string) => void): () => void
   /** Fires when a token request begins. Returns an unsubscribe function. */
   onRefreshStart(callback: () => void): () => void
   /** Fires when a token request ends (success or failure). Returns an unsubscribe function. */
   onRefreshEnd(callback: () => void): () => void
   /** Fires when a token request fails, with a redacted error. Returns an unsubscribe function. */
   onError(callback: (error: RefreshError) => void): () => void
}

/** Redacted error payload for {@link Provider.onError} — never carries tokens or secrets. */
interface RefreshError {
   /** Safe, human-readable message with credentials/tokens stripped. */
   message: string
   /** HTTP status if the failure came from the token endpoint. */
   status?: number
}

/** Result of local, offline `fhirStarter.validate(config)` — no network calls. */
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
