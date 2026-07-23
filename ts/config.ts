/** Split a scope string or array into a deduplicated-order list of non-empty scopes. */
export const normalizeScopes = (scopes: string | string[]): string[] =>
   Array.isArray(scopes) ? scopes.filter(Boolean) : scopes.split(/\s+/).filter(Boolean)

/** Type guard: true when the config uses private-key JWT (the SMART default). */
export const isKeyConfig = (config: AuthConfig): config is PrivateKeyAuthConfig =>
   config.clientAuthMethod === undefined || config.clientAuthMethod === "private_key_jwt"

/** Resolve a private key input (Buffer, raw PEM, or base64-encoded PEM) to PEM text. */
export const resolvePrivateKey = (privateKey: string | Buffer): string => {
   const raw = Buffer.isBuffer(privateKey) ? privateKey.toString("utf-8") : privateKey
   if (raw.includes("-----BEGIN")) return raw.trim()
   const decoded = Buffer.from(raw.replace(/\s/g, ""), "base64").toString("utf-8").trim()
   if (decoded.includes("-----BEGIN")) return decoded
   throw new Error(
      "AuthConfig: privateKey must be a PKCS#8 PEM, a Buffer, or base64-encoded PEM (file paths are not supported)",
   )
}

/** Validate an AuthConfig and return the resolved credential. Throws on any problem. */
export const validateConfig = (config: AuthConfig): ResolvedCredential => {
   if (!config.clientId) throw new Error("AuthConfig: clientId is required")
   if (!config.tokenEndpointUrl) throw new Error("AuthConfig: tokenEndpointUrl is required")
   if (normalizeScopes(config.scopes).length === 0)
      throw new Error("AuthConfig: at least one scope is required")
   try {
      new URL(config.tokenEndpointUrl)
   } catch {
      throw new Error(`AuthConfig: tokenEndpointUrl is not a valid URL: ${config.tokenEndpointUrl}`)
   }
   if (config.clientAuthMethod === "client_secret_basic" || config.clientAuthMethod === "client_secret_post") {
      if (!config.clientSecret) throw new Error("AuthConfig: clientSecret is required for secret auth")
      return { kind: config.clientAuthMethod, secret: config.clientSecret }
   }
   if (!config.privateKey || (Buffer.isBuffer(config.privateKey) && config.privateKey.length === 0))
      throw new Error("AuthConfig: privateKey is required")
   return { kind: "private_key_jwt", pem: resolvePrivateKey(config.privateKey) }
}
