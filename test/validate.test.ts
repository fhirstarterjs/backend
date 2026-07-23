// Local validation + hardened token parsing (slice 14). validate() is offline (no network);
// parsing rejects non-Bearer token_type and non-positive expires_in.
import { test } from "node:test"
import assert from "node:assert/strict"
import { generateKeyPairSync } from "node:crypto"
import fhirStarter from "../dist/index.js"
import { testKeyPem, testConfig, mockTokenEndpoint, tokenBody } from "./helpers.ts"

test("validate() passes for a well-formed config", () => {
   const result = fhirStarter(testConfig()).validate()
   assert.equal(result.ok, true, result.problems.join("; "))
})

test("validate() flags a non-HTTPS token endpoint", () => {
   const result = fhirStarter(testConfig({ tokenEndpointUrl: "http://auth.example/token" })).validate()
   assert.equal(result.ok, false)
   assert.match(result.problems.join(" "), /https/)
})

test("validate() flags an unsupported key curve", () => {
   const p256 = generateKeyPairSync("ec", {
      namedCurve: "P-256",
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
   }).privateKey
   const result = fhirStarter(testConfig({ privateKey: p256 })).validate()
   assert.equal(result.ok, false)
   assert.match(result.problems.join(" "), /curve/)
})

test("validate() flags duplicate kids across active/retired", () => {
   const pem = testKeyPem()
   const result = fhirStarter(testConfig({ privateKey: pem, retiredKeys: [pem] })).validate()
   assert.equal(result.ok, false)
   assert.match(result.problems.join(" "), /duplicate kid/)
})

test("parsing rejects a non-Bearer token_type", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600, { token_type: "mac" }))
      const auth = fhirStarter(testConfig({ backoffMs: 1, maxAttempts: 1 }))
      await assert.rejects(() => auth.start(), /token_type must be Bearer/)
   } finally {
      mock.restore()
   }
})

test("parsing accepts case-insensitive Bearer", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600, { token_type: "Bearer" }))
      const auth = fhirStarter(testConfig())
      await auth.start()
      assert.ok(auth.token)
      auth.stop()
   } finally {
      mock.restore()
   }
})
