declare global {
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
   }

   type RefreshCallback = (token: string) => void
}

export { TokenResponse, TokenCache, RefreshCallback }
