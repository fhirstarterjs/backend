// Characterization of v1 fhirStarter callback/lifecycle behavior — including the two
// quirks the 2.0 plan intends to CHANGE later (onRefresh fires on initial acquisition,
// and replays the current token to a late subscriber). Locked here so the change is
// deliberate and visible in a diff.
import { test } from "node:test"
import assert from "node:assert/strict"
import fhirStarter from "../ts/fhirstarter.ts"
import { testConfig, mockTokenEndpoint, tokenBody } from "./helpers.ts"

test("v1 QUIRK: onRefresh fires on the INITIAL start() acquisition", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = new fhirStarter(testConfig())
      const seen: string[] = []
      auth.onRefresh((t) => seen.push(t))
      await auth.start()
      assert.equal(seen.length, 1, "callback fired for the initial token")
      assert.equal(seen[0], auth.token)
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("v1 QUIRK: onRefresh replays current token to a LATE subscriber", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = new fhirStarter(testConfig())
      await auth.start()
      const seen: string[] = []
      auth.onRefresh((t) => seen.push(t)) // subscribe AFTER token exists
      assert.equal(seen.length, 1, "late subscriber immediately replayed current token")
      assert.equal(seen[0], auth.token)
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("onRefresh unsubscribe stops further callbacks", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = new fhirStarter(testConfig())
      const seen: string[] = []
      const off = auth.onRefresh((t) => seen.push(t))
      await auth.start()
      off()
      assert.equal(seen.length, 1, "only the initial callback was received")
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("tokenResponse() is a live view over the current cache", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = new fhirStarter(testConfig())
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
   const auth = new fhirStarter(testConfig({ keyId: "kid-1" }))
   const jwks = await auth.getJwks()
   const jwk = jwks.keys[0] as Record<string, unknown>
   assert.equal(jwk.alg, "RS384")
   assert.equal(jwk.use, "sig")
   assert.equal(jwk.kid, "kid-1")
   for (const priv of ["d", "p", "q", "dp", "dq", "qi"])
      assert.equal(jwk[priv], undefined, `private member ${priv} stripped`)
})
