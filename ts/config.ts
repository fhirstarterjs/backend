import { readFileSync } from "node:fs"

/** Split a scope string or array into a deduplicated-order list of non-empty scopes. */
export const normalizeScopes = (scopes: string | string[]): string[] =>
   Array.isArray(scopes) ? scopes.filter(Boolean) : scopes.split(/\s+/).filter(Boolean)

/** Resolve a private key input (Buffer, PEM text, or file path) to trimmed PEM text. */
export const resolvePrivateKey = (privateKey: string | Buffer): string => {
   if (Buffer.isBuffer(privateKey)) return privateKey.toString("utf-8").trim()
   const trimmed = privateKey.trim()
   if (trimmed.includes("-----BEGIN")) return trimmed
   try {
      return readFileSync(trimmed, "utf-8").trim()
   } catch {
      throw new Error(
         `AuthConfig: privateKey must be PEM text, a Buffer, or a readable file path: ${trimmed}`,
      )
   }
}

/** Validate an AuthConfig and return its resolved private-key text. Throws on any problem. */
export const validateConfig = (config: AuthConfig): string => {
   if (!config.clientId) throw new Error("AuthConfig: clientId is required")
   if (!config.privateKey || (Buffer.isBuffer(config.privateKey) && config.privateKey.length === 0))
      throw new Error("AuthConfig: privateKey is required")
   if (!config.tokenEndpointUrl) throw new Error("AuthConfig: tokenEndpointUrl is required")
   if (normalizeScopes(config.scopes).length === 0)
      throw new Error("AuthConfig: at least one scope is required")
   try {
      new URL(config.tokenEndpointUrl)
   } catch {
      throw new Error(`AuthConfig: tokenEndpointUrl is not a valid URL: ${config.tokenEndpointUrl}`)
   }
   return resolvePrivateKey(config.privateKey)
}
