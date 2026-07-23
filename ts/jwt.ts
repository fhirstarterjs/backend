import { importPKCS8, exportJWK, SignJWT, type JWTHeaderParameters } from "jose"
import { createHash, createPrivateKey, createPublicKey, randomUUID } from "node:crypto"
import type { PublicKeyInput } from "node:crypto"
import { resolvePrivateKey } from "./config.js"

/** Import (and memoize) the PKCS#8 private key as a jose CryptoKey for RS384 signing. */
export const getPrivateKey = async (state: ProviderState, pem: string) =>
   (state.privateKeyObj ??= await importPKCS8(pem, "RS384", { extractable: true }))

/** Build a signed client-assertion JWT (RFC 7523) for the token endpoint. */
export const buildJwt = async (config: AuthConfig, state: ProviderState, pem: string): Promise<string> => {
   const
      { clientId, tokenEndpointUrl, keyId, jwksUrl } = config,
      privateKey = await getPrivateKey(state, pem),
      header: JWTHeaderParameters = { alg: "RS384", typ: "JWT" }
   if (keyId) header.kid = keyId
   if (jwksUrl) header.jku = jwksUrl
   return new SignJWT({ iss: clientId, sub: clientId, aud: tokenEndpointUrl, jti: randomUUID() })
      .setProtectedHeader(header)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey)
}

/** Derive the public JWKS from the configured private key, stripping private members. */
export const getJwks = async (config: AuthConfig, state: ProviderState, pem: string): Promise<JwkSet> => {
   const jwk = await exportJWK(await getPrivateKey(state, pem))
   for (const priv of ["d", "p", "q", "dp", "dq", "qi"] as const) delete jwk[priv]
   jwk.alg = "RS384"
   jwk.use = "sig"
   if (config.keyId) jwk.kid = config.keyId
   return { keys: [jwk] }
}

/** RFC 7638 JWK Thumbprint (SHA-256 of canonical RSA public members, base64url). */
export const thumbprint = (privateKey: string | Buffer): string => {
   const key = createPrivateKey(resolvePrivateKey(privateKey))
   if (key.asymmetricKeyType !== "rsa")
      throw new Error(`thumbprint: expected RSA key, got ${key.asymmetricKeyType}`)
   const
      pub = createPublicKey(key as unknown as PublicKeyInput).export({ format: "jwk" }) as { e?: string, n?: string },
      canonical = JSON.stringify({ e: pub.e, kty: "RSA", n: pub.n })
   return createHash("sha256").update(canonical).digest("base64url")
}
