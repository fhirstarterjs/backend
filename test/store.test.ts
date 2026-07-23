// TokenStore contract + in-memory reference store + store-key derivation (slice 11a). Lease
// wiring into refresh is slice 11b; here we lock the store primitives in isolation.
import { test } from "node:test"
import assert from "node:assert/strict"
import fhirStarter from "../dist/index.js"
import { storeKey } from "../dist/store.js"
import { testConfig } from "./helpers.ts"

const record = (over: Partial<StoredToken> = {}): StoredToken => ({
   tokenType: "bearer",
   accessToken: "tok",
   refreshAt: Date.now() + 60_000,
   expiresAt: Date.now() + 120_000,
   ...over,
})

test("storeKey is stable and scope-order-independent, no secrets", () => {
   const a = storeKey(testConfig({ scopes: "b a" }))
   const b = storeKey(testConfig({ scopes: ["a", "b"] }))
   assert.equal(a, b, "same scopes in any order → same key")
   assert.doesNotMatch(a, /BEGIN|PRIVATE/, "no key material in the store key")
})

test("acquireLease is exclusive; renew/release are owner-scoped", async () => {
   const s = fhirStarter.memoryStore()
   assert.equal(await s.acquireLease("k", "o1", 1_000), true)
   assert.equal(await s.acquireLease("k", "o2", 1_000), false, "second owner blocked")
   assert.equal(await s.renewLease("k", "o2", 1_000), false, "non-owner cannot renew")
   assert.equal(await s.renewLease("k", "o1", 1_000), true, "owner renews")
   await s.releaseLease("k", "o2") // no-op for non-owner
   assert.equal(await s.acquireLease("k", "o2", 1_000), false, "still held by o1")
   await s.releaseLease("k", "o1")
   assert.equal(await s.acquireLease("k", "o2", 1_000), true, "free after owner release")
})

test("setUnderLease requires the lease; get honors expiry", async () => {
   const s = fhirStarter.memoryStore()
   await assert.rejects(() => s.setUnderLease("k", "o1", record()), /does not hold the lease/)
   await s.acquireLease("k", "o1", 1_000)
   await s.setUnderLease("k", "o1", record())
   assert.ok(await s.get("k"), "record readable under lease")
   await s.setUnderLease("k", "o1", record({ expiresAt: Date.now() - 1 }))
   assert.equal(await s.get("k"), null, "expired record is not returned")
})
