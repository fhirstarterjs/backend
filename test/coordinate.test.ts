// Lease-coordinated refresh across providers sharing one TokenStore (slice 11b). Locks:
// two providers sharing a store make ONE token request (peer adopts the shared token); a
// provider with no store keeps working; the shared record round-trips scope.
import { test } from "node:test"
import assert from "node:assert/strict"
import fhirStarter from "../dist/index.js"
import { testKeyPem, testConfig, mockTokenEndpoint, tokenBody } from "./helpers.ts"

test("two providers sharing a store trigger only one token request", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      mock.reply(tokenBody(3600)) // second reply available but should NOT be needed
      const
         store = fhirStarter.memoryStore(),
         pem = testKeyPem(),
         a = fhirStarter(testConfig({ privateKey: pem, tokenStore: store })),
         b = fhirStarter(testConfig({ privateKey: pem, tokenStore: store }))
      await a.start()
      await b.start()
      assert.equal(mock.calls.length, 1, "peer adopted the shared token — no second fetch")
      assert.equal(a.token, b.token, "both providers expose the same shared token")
      a.stop(), b.stop()
   } finally {
      mock.restore()
   }
})

test("a provider without a store still fetches its own token", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = fhirStarter(testConfig())
      await auth.start()
      assert.equal(mock.calls.length, 1)
      assert.ok(auth.token)
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("shared token record round-trips scope", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600, { scope: "system/Patient.rs" }))
      const store = fhirStarter.memoryStore()
      const auth = fhirStarter(testConfig({ tokenStore: store }))
      await auth.start()
      assert.equal(auth.tokenResponse().scope, "system/Patient.rs")
      auth.stop()
   } finally {
      mock.restore()
   }
})
