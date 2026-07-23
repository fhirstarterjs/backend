import { createHash } from "node:crypto"
import { normalizeScopes } from "./config.js"

/** Derive a versioned, non-secret store key from endpoint, client, auth method, and scopes. */
export const storeKey = (config: AuthConfig): string => {
   const
      method = config.clientAuthMethod ?? "private_key_jwt",
      scopes = [...normalizeScopes(config.scopes)].sort().join(" "),
      material = `v1|${config.tokenEndpointUrl}|${config.clientId}|${method}|${scopes}`
   return createHash("sha256").update(material).digest("base64url")
}

/**
 * In-memory reference {@link TokenStore}. Coordinates only within ONE process — supply your
 * own Redis/DB-backed store for multi-process deployments. Useful for tests and single-node.
 */
export const memoryStore = (): TokenStore => {
   const
      tokens = new Map<string, StoredToken>(),
      leases = new Map<string, { owner: string, expiresAt: number }>(),
      held = (key: string, owner: string): boolean => {
         const lease = leases.get(key)
         return !!lease && lease.owner === owner && Date.now() < lease.expiresAt
      }

   return {
      get: async (key) => {
         const rec = tokens.get(key)
         if (rec && Date.now() < rec.expiresAt) return rec
         if (rec) tokens.delete(key)
         return null
      },
      setUnderLease: async (key, owner, record) => {
         if (!held(key, owner)) throw new Error("setUnderLease: caller does not hold the lease")
         tokens.set(key, record)
      },
      delete: async (key) => void tokens.delete(key),
      acquireLease: async (key, owner, ttlMs) => {
         const lease = leases.get(key)
         if (lease && Date.now() < lease.expiresAt) return false
         leases.set(key, { owner, expiresAt: Date.now() + ttlMs })
         return true
      },
      renewLease: async (key, owner, ttlMs) => {
         if (!held(key, owner)) return false
         leases.set(key, { owner, expiresAt: Date.now() + ttlMs })
         return true
      },
      releaseLease: async (key, owner) => void (held(key, owner) && leases.delete(key)),
   }
}
