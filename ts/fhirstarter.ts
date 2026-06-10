import {
   importPKCS8,
   exportJWK,
   SignJWT,
   type JWTHeaderParameters,
} from "jose";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * SMART Backend Services auth provider.
 *
 * Manages client-credentials token acquisition and proactive refresh
 * using a private RSA key and the JWT Bearer client-assertion flow (RFC 7523).
 */
export default class FHIRStarter implements Provider {
   private readonly config: AuthConfig;
   private readonly privateKeyText: string;
   private readonly refreshCallbacks: Set<RefreshCallback> = new Set();
   private cache: TokenCache | null = null;
   private refreshPromise: Promise<string> | null = null;
   private refreshTimer: ReturnType<typeof setTimeout> | null = null;
   private privateKeyObj: Awaited<ReturnType<typeof importPKCS8>> | null = null;
   private started = false;
   private refreshFailed = false;
   private refreshRetryMs = 5_000;

   /**
    * @param config - Auth configuration including client ID, private key, token endpoint, and scopes.
    * @throws If any required field is missing, blank, or invalid.
    */
   constructor(config: AuthConfig) {
      if (!config.clientId) throw new Error("AuthConfig: clientId is required");
      if (
         !config.privateKey ||
         (Buffer.isBuffer(config.privateKey) && config.privateKey.length === 0)
      )
         throw new Error("AuthConfig: privateKey is required");
      if (!config.tokenEndpointUrl)
         throw new Error("AuthConfig: tokenEndpointUrl is required");

      const scopes = FHIRStarter.normalizeScopes(config.scopes);
      if (scopes.length === 0)
         throw new Error("AuthConfig: at least one scope is required");

      try {
         new URL(config.tokenEndpointUrl);
      } catch {
         throw new Error(
            `AuthConfig: tokenEndpointUrl is not a valid URL: ${config.tokenEndpointUrl}`,
         );
      }

      this.config = config;
      this.privateKeyText = FHIRStarter.resolvePrivateKey(config.privateKey);
   }

   // --- Sync getters ---

   /** The current access token, or `null` if no valid token is cached. */
   get token(): string | null {
      return this.cache && Date.now() < this.cache.expiresAt ?
            this.cache.accessToken
         :  null;
   }

   /** Seconds until the cached token expires, or `null` if no valid token is cached. */
   get expiresIn(): number | null {
      return this.cache && Date.now() < this.cache.expiresAt ?
            Math.ceil((this.cache.expiresAt - Date.now()) / 1000)
         :  null;
   }

   /** Ready-to-use `Authorization` header value (e.g. `"Bearer <token>"`), or `null` if no valid token is cached. */
   get authorizationHeader(): string | null {
      const token = this.token;
      return token ? `Bearer ${token}` : null;
   }

   // --- Lifecycle ---

   /**
    * Acquires an initial token and starts the proactive background refresh timer.
    * Safe to call multiple times — subsequent calls are no-ops.
    * @throws If the initial token acquisition fails.
    */
   start = async (): Promise<void> => {
      if (this.started) return;
      this.started = true;
      this.refreshRetryMs = 5_000;
      this.refreshFailed = false;
      try {
         await this.getAccessToken();
      } catch (err) {
         this.started = false;
         throw err;
      }
      this.scheduleRefresh();
   };

   /**
    * Stops the background refresh timer.
    * Any in-flight refresh will still complete, but no new timers will be scheduled.
    */
   stop = (): void => {
      this.started = false;
      if (this.refreshTimer) {
         clearTimeout(this.refreshTimer);
         this.refreshTimer = null;
      }
   };

   // --- Token adapters ---

   /**
    * Returns a live `LiveTokenResponse` object whose `access_token` and `expires_in`
    * properties are always read from the current cache.
    * Useful for libraries that hold a reference to a token response object.
    */
   tokenResponse = (): LiveTokenResponse => {
      const auth = this;
      return {
         token_type: "bearer",
         get access_token() {
            return auth.token ?? undefined;
         },
         get expires_in() {
            return auth.expiresIn ?? undefined;
         },
      };
   };

   /**
    * Registers a callback that is invoked whenever a new access token is obtained.
    * The callback is called immediately with the current token if one is already cached.
    * @param callback - Receives the new access token string.
    * @returns An unsubscribe function; call it to stop receiving updates.
    */
   onRefresh = (callback: RefreshCallback): (() => void) => {
      this.refreshCallbacks.add(callback);
      const current = this.token;
      if (current)
         try {
            callback(current);
         } catch {
            /* ignore */
         }
      return () => this.refreshCallbacks.delete(callback);
   };

   // --- Public async ---

   /**
    * Returns the public JWKS derived from the configured private key.
    * Private key material (`d`, `p`, `q`, etc.) is stripped before returning.
    */
   getJwks = async (): Promise<JwkSet> => {
      const { keyId } = this.config,
         privateKey = await this.getPrivateKey(),
         jwk = await exportJWK(privateKey);

      // Public key only — strip private components
      (delete jwk.d,
         delete jwk.p,
         delete jwk.q,
         delete jwk.dp,
         delete jwk.dq,
         delete jwk.qi);
      ((jwk.alg = "RS384"), (jwk.use = "sig"));
      if (keyId) jwk.kid = keyId;

      return { keys: [jwk] };
   };

   /**
    * Returns a valid access token, refreshing if the cached token is at or past its refresh threshold.
    * Falls back to a not-yet-expired stale token if the refresh request fails.
    * @throws If no cached token is available and the refresh request fails.
    */
   getAccessToken = async (): Promise<string> => {
      if (this.cache && Date.now() < this.cache.refreshAt)
         return this.cache.accessToken;
      const staleCache = this.cache;
      try {
         return await this.doRefresh();
      } catch (err) {
         // Graceful degradation: if the token is not actually expired yet, return it
         if (staleCache && Date.now() < staleCache.expiresAt)
            return staleCache.accessToken;
         throw err;
      }
   };

   // --- Private ---

   // Single-flight refresh — shared by getAccessToken and the proactive timer
   private doRefresh = (): Promise<string> => {
      if (this.refreshPromise) return this.refreshPromise;
      this.refreshPromise = this.refreshAccessToken()
         .then((cache) => {
            this.refreshPromise = null;
            this.refreshFailed = false;
            this.refreshRetryMs = 5_000;
            if (this.started) this.scheduleRefresh();
            return cache.accessToken;
         })
         .catch((err) => {
            this.refreshPromise = null;
            throw err;
         });
      return this.refreshPromise;
   };

   private scheduleRefresh = (): void => {
      if (!this.started) return;
      if (this.refreshTimer) clearTimeout(this.refreshTimer);

      const delay =
         !this.cache || this.refreshFailed ?
            this.refreshRetryMs
         :  Math.max(1_000, this.cache.refreshAt - Date.now());

      this.refreshTimer = setTimeout(async () => {
         try {
            await this.doRefresh();
         } catch {
            this.refreshFailed = true;
            this.refreshRetryMs = Math.min(this.refreshRetryMs * 2, 60_000);
            this.scheduleRefresh();
         }
      }, delay);

      this.refreshTimer.unref?.();
   };

   private notifyRefresh = (token: string): void => {
      for (const callback of this.refreshCallbacks)
         try {
            callback(token);
         } catch {
            // Ignore callback failures; auth lifecycle must continue.
         }
   };

   private refreshAccessToken = async (): Promise<TokenCache> => {
      const jwt = await this.buildJwt(),
         scopes = FHIRStarter.normalizeScopes(this.config.scopes),
         body = new URLSearchParams({
            grant_type: "client_credentials",
            client_assertion_type:
               "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            client_assertion: jwt,
            scope: scopes.join(" "),
         }),
         res = await fetch(this.config.tokenEndpointUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
            signal: AbortSignal.timeout(30_000),
         });

      if (!res.ok) {
         const text = await res.text().catch(() => "(no body)");
         throw new Error(`Token request failed (${res.status}): ${text}`);
      }

      let data: TokenResponse;
      try {
         data = await res.json();
      } catch {
         throw new Error("Token response is not valid JSON");
      }

      if (!data.access_token || typeof data.access_token !== "string")
         throw new Error("Token response missing access_token");
      if (typeof data.expires_in !== "number" || data.expires_in <= 0)
         throw new Error("Token response has invalid expires_in");

      const ttlMs = data.expires_in * 1000,
         bufferMs = Math.min(60_000, ttlMs / 2),
         now = Date.now(),
         expiresAt = now + ttlMs,
         refreshAt = expiresAt - bufferMs,
         cache: TokenCache = {
            accessToken: data.access_token,
            refreshAt,
            expiresAt,
         };

      this.cache = cache;
      this.notifyRefresh(cache.accessToken);
      return cache;
   };

   private getPrivateKey = async (): Promise<
      Awaited<ReturnType<typeof importPKCS8>>
   > => {
      if (!this.privateKeyObj)
         this.privateKeyObj = await importPKCS8(this.privateKeyText, "RS384", {
            extractable: true,
         });
      return this.privateKeyObj;
   };

   private buildJwt = async (): Promise<string> => {
      const { clientId, tokenEndpointUrl, keyId, jwksUrl } = this.config,
         privateKey = await this.getPrivateKey(),
         header: JWTHeaderParameters = { alg: "RS384", typ: "JWT" };
      if (keyId) header.kid = keyId;
      if (jwksUrl) header.jku = jwksUrl;

      return new SignJWT({
         iss: clientId,
         sub: clientId,
         aud: tokenEndpointUrl,
         jti: randomUUID(), // unique per RFC 7523 §3
      })
         .setProtectedHeader(header)
         .setIssuedAt()
         .setExpirationTime("5m")
         .sign(privateKey);
   };

   // --- Static helpers ---

   private static normalizeScopes(scopes: string | string[]): string[] {
      return Array.isArray(scopes) ?
            scopes.filter(Boolean)
         :  scopes.split(/\s+/).filter(Boolean);
   }

   private static resolvePrivateKey(privateKey: string | Buffer): string {
      if (Buffer.isBuffer(privateKey))
         return privateKey.toString("utf-8").trim();

      const trimmed = privateKey.trim();
      if (trimmed.includes("-----BEGIN")) return trimmed;

      try {
         return readFileSync(trimmed, "utf-8").trim();
      } catch {
         throw new Error(
            `AuthConfig: privateKey must be PEM text, a Buffer, or a readable file path: ${trimmed}`,
         );
      }
   }
}
