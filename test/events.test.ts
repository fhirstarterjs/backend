// Lifecycle events (slice 13): onRefresh fires on re-acquisition; onRefreshStart/End bracket
// each request; onError delivers a redacted payload with no secrets/tokens.
import { test } from "node:test"
import assert from "node:assert/strict"
import fhirStarter from "../dist/index.js"
import { toRefreshError } from "../dist/events.js"
import { testConfig, mockTokenEndpoint, tokenBody } from "./helpers.ts"

test("onRefresh fires on a re-acquisition after the initial token", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(2)) // ttl=2s → refreshAt ~1s
      mock.reply(tokenBody(3600))
      const auth = fhirStarter(testConfig())
      const seen: string[] = []
      auth.onRefresh((t) => seen.push(t))
      await auth.start()
      assert.equal(seen.length, 0, "initial token does not fire onRefresh")
      await new Promise((r) => setTimeout(r, 1100))
      const tok = await auth.getAccessToken() // past refreshAt → re-acquires
      assert.equal(seen.length, 1, "re-acquisition fires onRefresh")
      assert.equal(seen[0], tok)
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("onRefreshStart/onRefreshEnd bracket a token request", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = fhirStarter(testConfig())
      const order: string[] = []
      auth.onRefreshStart(() => order.push("start"))
      auth.onRefreshEnd(() => order.push("end"))
      await auth.start()
      assert.deepEqual(order, ["start", "end"])
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("onError fires with a redacted, status-tagged payload", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.fail(401, { error: "invalid_client" })
      const auth = fhirStarter(testConfig({ backoffMs: 1 }))
      const errors: RefreshError[] = []
      auth.onError((e) => errors.push(e))
      await assert.rejects(() => auth.start())
      assert.equal(errors.length, 1)
      assert.equal(errors[0]!.status, 401)
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("toRefreshError redacts credential material", () => {
   const e = toRefreshError(new Error("boom client_secret=SUPERSECRET&x=1"))
   assert.match(e.message, /client_secret=<redacted>/)
   assert.doesNotMatch(e.message, /SUPERSECRET/)
})
