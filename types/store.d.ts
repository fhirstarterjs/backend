/** A serializable token record persisted in a shared {@link TokenStore}. */
interface StoredToken {
   tokenType: string
   accessToken: string
   /** Epoch ms — when to attempt proactive refresh. */
   refreshAt: number
   /** Epoch ms — actual expiry; the record must be treated as gone after this. */
   expiresAt: number
   scope?: string
}

/**
 * Pluggable shared token store for coordinating refresh across processes. Implement against
 * Redis, a database, etc. All methods are async. Lease methods must be atomic and owner-scoped;
 * `setUnderLease` must verify the caller still holds the lease before writing.
 */
interface TokenStore {
   /** Read the current token record, or null if absent/expired. */
   get(key: string): Promise<StoredToken | null>
   /** Write a record only if `owner` currently holds the lease for `key`. */
   setUnderLease(key: string, owner: string, record: StoredToken): Promise<void>
   /** Remove the record for `key`. */
   delete(key: string): Promise<void>
   /** Atomically acquire the refresh lease for `key`; true if acquired. */
   acquireLease(key: string, owner: string, ttlMs: number): Promise<boolean>
   /** Extend the lease TTL; true only if `owner` still holds it. */
   renewLease(key: string, owner: string, ttlMs: number): Promise<boolean>
   /** Release the lease; only succeeds for the matching `owner`. */
   releaseLease(key: string, owner: string): Promise<void>
}
