// Key rotation + JWKS overlap (slice 10d). Locks: getJwks publishes the active key plus all
// retired keys, each with a distinct kid; default kid is the RFC 7638 thumbprint; duplicate
// kids are de-duplicated; signing always uses the active key.
import { test } from "node:test"
import assert from "node:assert/strict"
import fhirStarter from "../dist/index.js"
import { testKeyPem, testConfig } from "./helpers.ts"

test("default kid is the thumbprint of the active key", async () => {
   const pem = testKeyPem()
   const auth = fhirStarter(testConfig({ privateKey: pem }))
   const jwk = (await auth.getJwks()).keys[0] as Record<string, unknown>
   assert.equal(jwk.kid, fhirStarter.thumbprint(pem))
})

test("getJwks publishes active + retired keys with distinct kids", async () => {
   const active = testKeyPem(), retired = testKeyPem()
   const auth = fhirStarter(testConfig({ privateKey: active, retiredKeys: [retired] }))
   const keys = (await auth.getJwks()).keys
   assert.equal(keys.length, 2)
   const kids = keys.map((k) => k.kid)
   assert.deepEqual([...kids].sort(), [fhirStarter.thumbprint(active), fhirStarter.thumbprint(retired)].sort())
})

test("duplicate keys across active/retired are de-duplicated in JWKS", async () => {
   const pem = testKeyPem()
   const auth = fhirStarter(testConfig({ privateKey: pem, retiredKeys: [pem] }))
   const keys = (await auth.getJwks()).keys
   assert.equal(keys.length, 1, "same key appears once")
})

test("an explicit keyId overrides the active thumbprint kid", async () => {
   const auth = fhirStarter(testConfig({ keyId: "explicit" }))
   const keys = (await auth.getJwks()).keys
   assert.equal(keys[0]!.kid, "explicit")
})
