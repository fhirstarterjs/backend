// Characterization of v1 fhirStarter token/refresh behavior. Locks CURRENT behavior
// (including quirks) so the 2.0 refactor is provably behavior-preserving until a slice
// intentionally changes a documented semantic.
import { test } from "node:test"
import assert from "node:assert/strict"
import fhirStarter from "../ts/fhirstarter.ts"
import { testConfig, mockTokenEndpoint, tokenBody } from "./helpers.ts"

test("start() acquires a token and exposes it via getters", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = new fhirStarter(testConfig())
      await auth.start()
      assert.ok(auth.token, "token is set after start")
      assert.equal(auth.authorizationHeader, `Bearer ${auth.token}`)
      assert.ok((auth.expiresIn ?? 0) > 3500, "expiresIn reflects ttl")
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("start() is idempotent — second call does not re-fetch", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = new fhirStarter(testConfig())
      await auth.start()
      await auth.start()
      assert.equal(mock.calls.length, 1, "only one token request")
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("getAccessToken returns cached token before refreshAt (no extra fetch)", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = new fhirStarter(testConfig())
      await auth.start()
      const first = await auth.getAccessToken()
      const second = await auth.getAccessToken()
      assert.equal(first, second)
      assert.equal(mock.calls.length, 1)
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("stale-but-unexpired token is returned when refresh fails", async () => {
   const mock = mockTokenEndpoint()
   try {
      // ttl=2s → refreshAt = expiresAt - min(60s, ttl/2) = now+1s; expiresAt = now+2s.
      mock.reply(tokenBody(2))
      const auth = new fhirStarter(testConfig())
      await auth.start()
      const original = auth.token
      await new Promise((r) => setTimeout(r, 1100)) // past refreshAt, before expiresAt
      mock.fail(500) // refresh attempt fails
      const token = await auth.getAccessToken()
      assert.equal(token, original, "falls back to stale-but-unexpired token")
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("refresh buffer is min(60s, ttl/2): large ttl uses 60s buffer", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = new fhirStarter(testConfig())
      await auth.start()
      // expiresIn ~3600; refreshAt is 60s before expiry, so still cached now.
      assert.equal(mock.calls.length, 1)
      const again = await auth.getAccessToken()
      assert.ok(again)
      assert.equal(mock.calls.length, 1, "no refresh — within buffer window")
      auth.stop()
   } finally {
      mock.restore()
   }
})
