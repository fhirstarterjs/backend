import { normalizeScopes, isKeyConfig } from "./config.js"
import { buildJwt } from "./jwt.js"
import { retryableStatus, attemptSignal, retryAfterMs, abortableSleep, backoffDelay } from "./retry.js"

/**
 * Request a fresh access token, retrying transient failures. Each attempt builds a fresh JWT
 * assertion (new `jti`). Only network errors and 408/429/5xx are retried; permanent 4xx
 * (e.g. invalid_client, invalid_scope) fail immediately. Backoff honors `Retry-After`.
 */
export const requestToken = async (
   config: AuthConfig,
   state: ProviderState,
   cred: ResolvedCredential,
   signal?: AbortSignal,
): Promise<TokenCache> => {
   const
      maxAttempts = config.maxAttempts ?? 3,
      timeoutMs = config.timeoutMs ?? 30_000,
      baseMs = config.backoffMs ?? 500
   let retryAfter: number | null = null
   for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await abortableSleep(backoffDelay(attempt - 1, baseMs, retryAfter), signal)
      const outcome = await attemptOnce(config, state, cred, attemptSignal(signal, timeoutMs))
      if ("cache" in outcome) return outcome.cache
      if (!outcome.retryable || attempt === maxAttempts - 1) throw new Error(outcome.error)
      retryAfter = outcome.retryAfter
   }
   throw new Error("Token request failed after retries")
}

/** Perform a single token request attempt; returns a cache entry or a classified failure. */
const attemptOnce = async (
   config: AuthConfig,
   state: ProviderState,
   cred: ResolvedCredential,
   signal: AbortSignal,
): Promise<AttemptOutcome> => {
   const { body, headers } = await buildRequest(config, state, cred)
   let res: Response
   try {
      res = await fetch(config.tokenEndpointUrl, { method: "POST", headers, body, signal })
   } catch (err) {
      return { retryable: true, retryAfter: null, error: `Token request network error: ${(err as Error).message}` }
   }
   if (!res.ok) {
      const text = await res.text().catch(() => "(no body)")
      return {
         retryable: retryableStatus(res.status),
         retryAfter: retryAfterMs(res.headers.get("retry-after")),
         error: `Token request failed (${res.status}): ${text}`,
      }
   }
   try {
      return { cache: toCache(await res.json()) }
   } catch {
      return { retryable: false, retryAfter: null, error: "Token response is not valid JSON" }
   }
}

/** Build the request body + headers for the configured auth mode (fresh JWT per call). */
const buildRequest = async (config: AuthConfig, state: ProviderState, cred: ResolvedCredential) => {
   const
      body = new URLSearchParams({
         grant_type: "client_credentials",
         scope: normalizeScopes(config.scopes).join(" "),
      }),
      headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" }
   if (cred.kind === "private_key_jwt" && isKeyConfig(config)) {
      body.set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer")
      body.set("client_assertion", await buildJwt(config, state, cred.pem))
   } else if (cred.kind === "client_secret_post") {
      body.set("client_id", config.clientId)
      body.set("client_secret", cred.secret)
   } else if (cred.kind === "client_secret_basic")
      headers.Authorization = `Basic ${Buffer.from(
         `${encodeURIComponent(config.clientId)}:${encodeURIComponent(cred.secret)}`,
      ).toString("base64")}`
   return { body, headers }
}

/** Validate a raw token response and compute cache timestamps. */
const toCache = (data: TokenResponse): TokenCache => {
   if (!data.access_token || typeof data.access_token !== "string")
      throw new Error("Token response missing access_token")
   if (typeof data.expires_in !== "number" || data.expires_in <= 0)
      throw new Error("Token response has invalid expires_in")
   const
      ttlMs = data.expires_in * 1000,
      now = Date.now(),
      expiresAt = now + ttlMs
   return {
      accessToken: data.access_token,
      expiresAt,
      refreshAt: expiresAt - Math.min(60_000, ttlMs / 2),
      ...(typeof data.scope === "string" && { scope: data.scope }),
   }
}
