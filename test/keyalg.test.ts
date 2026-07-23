// ES384/P-384 support + generalized RFC 7638 thumbprint (slice 10c). Locks: RSA→RS384,
// P-384 EC→ES384, JWKS advertises the inferred alg, thumbprint works for both families and
// is stable, and unsupported curves are rejected.
import { test } from "node:test"
import assert from "node:assert/strict"
import { generateKeyPairSync } from "node:crypto"
import fhirStarter from "../dist/index.js"
import { keyAlg } from "../dist/jwt.js"
import { testKeyPem, testEcKeyPem, testConfig, mockTokenEndpoint, tokenBody } from "./helpers.ts"

test("keyAlg infers RS384 for RSA and ES384 for P-384 EC", () => {
   assert.equal(keyAlg(testKeyPem()), "RS384")
   assert.equal(keyAlg(testEcKeyPem()), "ES384")
})

test("keyAlg rejects an unsupported EC curve", () => {
   const p256 = generateKeyPairSync("ec", {
      namedCurve: "P-256",
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
   }).privateKey
   assert.throws(() => keyAlg(p256), /unsupported EC curve/)
})

test("getJwks advertises ES384 for an EC key", async () => {
   const auth = fhirStarter(testConfig({ privateKey: testEcKeyPem() }))
   const jwk = (await auth.getJwks()).keys[0] as Record<string, unknown>
   assert.equal(jwk.alg, "ES384")
   assert.equal(jwk.kty, "EC")
   assert.equal(jwk.crv, "P-384")
})

test("an EC-key provider can start and sign an ES384 assertion", async () => {
   const mock = mockTokenEndpoint()
   try {
      mock.reply(tokenBody(3600))
      const auth = fhirStarter(testConfig({ privateKey: testEcKeyPem() }))
      await auth.start()
      assert.ok(auth.token)
      auth.stop()
   } finally {
      mock.restore()
   }
})

test("thumbprint is stable and family-specific", () => {
   const rsa = testKeyPem(), ec = testEcKeyPem()
   assert.equal(fhirStarter.thumbprint(rsa), fhirStarter.thumbprint(rsa), "RSA stable")
   assert.equal(fhirStarter.thumbprint(ec), fhirStarter.thumbprint(ec), "EC stable")
   assert.notEqual(fhirStarter.thumbprint(rsa), fhirStarter.thumbprint(ec))
})
