import { randomUUID } from "node:crypto"
import { requestToken } from "./token.js"
import { storeKey } from "./store.js"

/** Fetch a token, coordinating across processes via the shared store when configured. */
export const coordinatedRequest = async (
   config: AuthConfig,
   state: ProviderState,
   cred: ResolvedCredential,
): Promise<TokenCache> => {
   const store = config.tokenStore
   if (!store) return requestToken(config, state, cred)

   const
      key = storeKey(config),
      owner = randomUUID(),
      leaseMs = 30_000,
      shared = await store.get(key)
   if (shared && Date.now() < shared.refreshAt) return fromStored(shared)

   if (!(await store.acquireLease(key, owner, leaseMs))) return awaitPeer(store, key)

   let renew: ReturnType<typeof setInterval> | undefined
   try {
      const reread = await store.get(key)
      if (reread && Date.now() < reread.refreshAt) return fromStored(reread)
      renew = setInterval(() => void store.renewLease(key, owner, leaseMs), leaseMs / 2)
      renew.unref?.()
      const cache = await requestToken(config, state, cred)
      await store.setUnderLease(key, owner, toStored(cache))
      return cache
   } finally {
      renew && clearInterval(renew)
      await store.releaseLease(key, owner)
   }
}

/** Poll the store for a peer-refreshed token; fall back to erroring if none appears in time. */
const awaitPeer = async (store: TokenStore, key: string): Promise<TokenCache> => {
   for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 200))
      const rec = await store.get(key)
      if (rec && Date.now() < rec.expiresAt) return fromStored(rec)
   }
   throw new Error("coordinatedRequest: timed out waiting for a peer token refresh")
}

/** Convert a shared store record to the in-process cache shape. */
const fromStored = (s: StoredToken): TokenCache => ({
   accessToken: s.accessToken,
   refreshAt: s.refreshAt,
   expiresAt: s.expiresAt,
   ...(s.scope !== undefined && { scope: s.scope }),
})

/** Convert an in-process cache entry to the serializable store record. */
const toStored = (c: TokenCache): StoredToken => ({
   tokenType: "bearer",
   accessToken: c.accessToken,
   refreshAt: c.refreshAt,
   expiresAt: c.expiresAt,
   ...(c.scope !== undefined && { scope: c.scope }),
})
