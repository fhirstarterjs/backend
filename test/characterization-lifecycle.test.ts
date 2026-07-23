// v2 callback/lifecycle semantics: onRefresh fires ONLY on re-acquisition (not the initial
// token, store loads, or late-subscriber replay). Lifecycle events are covered in events.test.
import { test } from "node:test"
import assert from "node:assert/strict"
import fhirStarter from "../dist/index.js"
import { testConfig, mockTokenEndpoint, tokenBody } from "./helpers.ts"

test("onRefresh does NOT fire on the initial start() acquisition", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = fhirStarter(testConfig())
      const seen: string[] = []
      auth.onRefresh((t) => seen.push(t))
      await auth.start()
      assert.equal(seen.length, 0, "no callback for the initial token")
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("onRefresh does NOT replay the current token to a late subscriber", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = fhirStarter(testConfig())
      await auth.start()
      const seen: string[] = []
      auth.onRefresh((t) => seen.push(t)) // subscribe AFTER token exists
      assert.equal(seen.length, 0, "no replay to late subscriber")
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("onRefresh unsubscribe removes the callback", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = fhirStarter(testConfig())
      const seen: string[] = []
      const off = auth.onRefresh((t) => seen.push(t))
      await auth.start()
      off()
      assert.equal(seen.length, 0, "no initial callback under v2 semantics")
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("tokenResponse() is a live view over the current cache", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = fhirStarter(testConfig())
      const tr = auth.tokenResponse()
      assert.equal(tr.access_token, undefined, "undefined before start")
      await auth.start()
      assert.equal(tr.token_type, "bearer")
      assert.equal(tr.access_token, auth.token, "live-reads current token")
      assert.ok((tr.expires_in ?? 0) > 3500)
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("getJwks() strips private members and marks RS384/sig", async () => {
   const auth = fhirStarter(testConfig({ keyId: "kid-1" }))
   const jwks = await auth.getJwks()
   const jwk = jwks.keys[0] as Record<string, unknown>
   assert.equal(jwk.alg, "RS384")
   assert.equal(jwk.use, "sig")
   assert.equal(jwk.kid, "kid-1")
   for (const priv of ["d", "p", "q", "dp", "dq", "qi"])
      assert.equal(jwk[priv], undefined, `private member ${priv} stripped`)
})
