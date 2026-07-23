import { exportJWK } from "jose"
import { createPrivateKey, createPublicKey } from "node:crypto"
import type { JWK } from "jose"
import type { PublicKeyInput } from "node:crypto"
import { resolvePrivateKey, isKeyConfig } from "./config.js"
import { keyAlg, thumbprint } from "./jwt.js"

/** Build a public JWK (with alg/use/kid) from a private key input (PEM/Buffer/base64). */
export const publicJwk = async (keyInput: string | Buffer, kid?: string): Promise<JWK> => {
   const
      pem = resolvePrivateKey(keyInput),
      pub = createPublicKey(createPrivateKey(pem) as unknown as PublicKeyInput),
      jwk = await exportJWK(pub)
   jwk.alg = keyAlg(pem)
   jwk.use = "sig"
   jwk.kid = kid ?? thumbprint(pem)
   return jwk
}

/**
 * Derive the public JWKS: the active signing key plus any retired keys kept for rotation
 * overlap. Signing always uses the active key; retired keys are publish-only.
 */
export const getJwks = async (config: AuthConfig, cred: ResolvedCredential): Promise<JwkSet> => {
   if (cred.kind !== "private_key_jwt" || !isKeyConfig(config))
      throw new Error("getJwks: not available for client-secret auth (no signing key)")
   const
      active = await publicJwk(cred.pem, config.keyId),
      retired = await Promise.all((config.retiredKeys ?? []).map((k) => publicJwk(k))),
      seen = new Set<string>()
   return {
      keys: [active, ...retired].filter((jwk) => {
         const kid = jwk.kid ?? ""
         return seen.has(kid) ? false : (seen.add(kid), true)
      }),
   }
}
