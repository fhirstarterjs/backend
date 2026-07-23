// Transport resilience (slice 12): retry classification, backoff, and no-retry on permanent
// 4xx. Uses a tiny backoffMs to keep tests fast. Each retry builds a fresh JWT (new jti).
import { test } from "node:test"
import assert from "node:assert/strict"
import fhirStarter from "../dist/index.js"
import { retryableStatus, retryAfterMs } from "../dist/retry.js"
import { testConfig, mockTokenEndpoint, tokenBody } from "./helpers.ts"

test("retryableStatus classifies transient vs permanent", () => {
   for (const s of [408, 429, 500, 503]) assert.equal(retryableStatus(s), true, `${s} retryable`)
   for (const s of [400, 401, 403, 404]) assert.equal(retryableStatus(s), false, `${s} permanent`)
})

test("retryAfterMs parses delta-seconds and rejects garbage", () => {
   assert.equal(retryAfterMs("2"), 2000)
   assert.equal(retryAfterMs(null), null)
   assert.equal(retryAfterMs("garbage"), null)
})

test("a transient 503 is retried, then succeeds", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.fail(503)
      mock.reply(tokenBody(3600))
      const auth = fhirStarter(testConfig({ backoffMs: 1 }))
      await auth.start()
      assert.equal(mock.calls.length, 2, "one retry after the 503")
      assert.ok(auth.token)
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("a permanent 401 is NOT retried", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.fail(401, { error: "invalid_client" })
      const auth = fhirStarter(testConfig({ backoffMs: 1 }))
      await assert.rejects(() => auth.start(), /401/)
      assert.equal(mock.calls.length, 1, "no retry on permanent 4xx")
   } finally {
      mock.restore()
   }
})

test("retries are exhausted after maxAttempts", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.fail(500), mock.fail(500), mock.fail(500)
      const auth = fhirStarter(testConfig({ backoffMs: 1, maxAttempts: 3 }))
      await assert.rejects(() => auth.start(), /500/)
      assert.equal(mock.calls.length, 3, "exactly maxAttempts tries")
   } finally {
      mock.restore()
   }
})
