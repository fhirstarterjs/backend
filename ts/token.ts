import { normalizeScopes, isKeyConfig } from "./config.js"
import { buildJwt } from "./jwt.js"

/** Request a fresh access token from the endpoint and return a validated cache entry. */
export const requestToken = async (
   config: AuthConfig,
   state: ProviderState,
   cred: ResolvedCredential,
): Promise<TokenCache> => {
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
   } else if (cred.kind === "client_secret_basic") {
      const basic = Buffer.from(
         `${encodeURIComponent(config.clientId)}:${encodeURIComponent(cred.secret)}`,
      ).toString("base64")
      headers.Authorization = `Basic ${basic}`
   }

   const res = await fetch(config.tokenEndpointUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(30_000),
   })

   if (!res.ok) {
      const text = await res.text().catch(() => "(no body)")
      throw new Error(`Token request failed (${res.status}): ${text}`)
   }

   let data: TokenResponse
   try {
      data = await res.json()
   } catch {
      throw new Error("Token response is not valid JSON")
   }
   return toCache(data)
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
