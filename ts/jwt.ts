import { importPKCS8, exportJWK, SignJWT, type JWTHeaderParameters } from "jose"
import { createHash, createPrivateKey, createPublicKey, randomUUID } from "node:crypto"
import type { KeyObject, PublicKeyInput } from "node:crypto"
import { resolvePrivateKey, isKeyConfig } from "./config.js"

/** Infer the SMART signing algorithm from key material: RSA→RS384, P-384 EC→ES384. */
export const keyAlg = (pem: string): "RS384" | "ES384" => {
   const key = createPrivateKey(pem)
   if (key.asymmetricKeyType === "rsa") return "RS384"
   if (key.asymmetricKeyType === "ec") {
      const crv = (key.export({ format: "jwk" }) as { crv?: string }).crv
      if (crv === "P-384") return "ES384"
      throw new Error(`unsupported EC curve: ${crv} (only P-384/ES384 is supported)`)
   }
   throw new Error(`unsupported key type: ${key.asymmetricKeyType} (RSA or P-384 EC only)`)
}

/** Import (and memoize) the PKCS#8 private key as a jose CryptoKey for its inferred alg. */
export const getPrivateKey = async (state: ProviderState, pem: string) =>
   (state.privateKeyObj ??= await importPKCS8(pem, keyAlg(pem), { extractable: true }))

/** Build a signed client-assertion JWT (RFC 7523) for the token endpoint (key mode only). */
export const buildJwt = async (config: PrivateKeyAuthConfig, state: ProviderState, pem: string): Promise<string> => {
   const
      { clientId, tokenEndpointUrl, keyId, jwksUrl } = config,
      privateKey = await getPrivateKey(state, pem),
      header: JWTHeaderParameters = { alg: keyAlg(pem), typ: "JWT" }
   if (keyId) header.kid = keyId
   if (jwksUrl) header.jku = jwksUrl
   return new SignJWT({ iss: clientId, sub: clientId, aud: tokenEndpointUrl, jti: randomUUID() })
      .setProtectedHeader(header)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey)
}

/** Derive the public JWKS from the configured private key, stripping private members. */
export const getJwks = async (config: AuthConfig, state: ProviderState, cred: ResolvedCredential): Promise<JwkSet> => {
   if (cred.kind !== "private_key_jwt")
      throw new Error("getJwks: not available for client-secret auth (no signing key)")
   const jwk = await exportJWK(await getPrivateKey(state, cred.pem))
   for (const priv of ["d", "p", "q", "dp", "dq", "qi"] as const) delete jwk[priv]
   jwk.alg = keyAlg(cred.pem)
   jwk.use = "sig"
   if (isKeyConfig(config) && config.keyId) jwk.kid = config.keyId
   return { keys: [jwk] }
}

/** RFC 7638 JWK Thumbprint (SHA-256 of canonical public members, base64url) for RSA or EC. */
export const thumbprint = (privateKey: string | Buffer): string => {
   const
      key = createPrivateKey(resolvePrivateKey(privateKey)),
      pub = createPublicKey(key as unknown as PublicKeyInput).export({ format: "jwk" }),
      canonical = canonicalJwk(key.asymmetricKeyType, pub)
   return createHash("sha256").update(canonical).digest("base64url")
}

/** Build the RFC 7638 canonical (sorted, minimal) JWK JSON for thumbprinting. */
const canonicalJwk = (type: KeyObject["asymmetricKeyType"], jwk: JsonWebKey): string => {
   if (type === "rsa") return JSON.stringify({ e: jwk.e, kty: "RSA", n: jwk.n })
   if (type === "ec") return JSON.stringify({ crv: jwk.crv, kty: "EC", x: jwk.x, y: jwk.y })
   throw new Error(`thumbprint: unsupported key type ${type} (RSA or EC only)`)
}
