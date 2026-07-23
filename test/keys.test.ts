// Key ingestion: base64-first, no file paths. Locks the slice-10a behavior — raw PEM,
// Buffer, and base64-encoded PEM all resolve; a file-path-like string is rejected.
import { test } from "node:test"
import assert from "node:assert/strict"
import { resolvePrivateKey } from "../dist/config.js"
import { testKeyPem } from "./helpers.ts"

test("raw PEM text passes through trimmed", () => {
   const pem = testKeyPem()
   assert.equal(resolvePrivateKey(`  ${pem}  `), pem.trim())
})

test("Buffer of PEM is decoded to text", () => {
   const pem = testKeyPem()
   assert.equal(resolvePrivateKey(Buffer.from(pem, "utf-8")), pem.trim())
})

test("base64-encoded PEM is decoded", () => {
   const pem = testKeyPem()
   const b64 = Buffer.from(pem, "utf-8").toString("base64")
   assert.equal(resolvePrivateKey(b64), pem.trim())
})

test("base64 with whitespace/newlines is still decoded", () => {
   const pem = testKeyPem()
   const b64 = Buffer.from(pem, "utf-8").toString("base64").replace(/(.{20})/g, "$1\n")
   assert.equal(resolvePrivateKey(b64), pem.trim())
})

test("a file-path-like string is rejected (no file support)", () => {
   assert.throws(() => resolvePrivateKey("/etc/keys/private.pem"), /file paths are not supported/)
})
