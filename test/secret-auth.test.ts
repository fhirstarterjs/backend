// Non-SMART OAuth secret auth modes (slice 10b). Locks: client_secret_post puts credentials
// in the body; client_secret_basic uses the Authorization header; neither sends a JWT
// assertion; validation rejects a secret config missing the secret.
import { test } from "node:test"
import assert from "node:assert/strict"
import fhirStarter from "../dist/index.js"
import { mockTokenEndpoint, tokenBody } from "./helpers.ts"

const secretConfig = (method: "client_secret_basic" | "client_secret_post"): AuthConfig => ({
   clientId: "cid",
   clientAuthMethod: method,
   clientSecret: "shh",
   tokenEndpointUrl: "https://auth.example/token",
   scopes: "system/*.read",
})

test("client_secret_post sends client_id + client_secret in the body, no JWT", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = fhirStarter(secretConfig("client_secret_post"))
      await auth.start()
      const body = mock.calls[0]!
      assert.equal(body.get("client_id"), "cid")
      assert.equal(body.get("client_secret"), "shh")
      assert.equal(body.get("client_assertion"), null, "no JWT assertion sent")
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("client_secret_basic sends an Authorization header, not body credentials", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = fhirStarter(secretConfig("client_secret_basic"))
      await auth.start()
      const expected = "Basic " + Buffer.from("cid:shh").toString("base64")
      assert.equal(mock.headers[0]!.Authorization, expected)
      assert.equal(mock.calls[0]!.get("client_secret"), null, "secret not in body")
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("secret config without clientSecret is rejected", () => {
   assert.throws(
      () => fhirStarter({ clientId: "c", clientAuthMethod: "client_secret_post", clientSecret: "", tokenEndpointUrl: "https://a.example/t", scopes: "s" }),
      /clientSecret is required/,
   )
})
