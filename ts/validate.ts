import { resolvePrivateKey, isKeyConfig, normalizeScopes } from "./config.js"
import { keyAlg, thumbprint } from "./jwt.js"

/** Run local, offline validation of a config: URL scheme, scopes, keys, and unique kids. */
export const validate = (config: AuthConfig): ValidationResult => {
   const problems: string[] = []

   try {
      if (new URL(config.tokenEndpointUrl).protocol !== "https:")
         problems.push("tokenEndpointUrl must use https")
   } catch {
      problems.push(`tokenEndpointUrl is not a valid URL: ${config.tokenEndpointUrl}`)
   }
   if (normalizeScopes(config.scopes).length === 0) problems.push("at least one scope is required")

   if (isKeyConfig(config)) validateKeys(config, problems)
   else if (!config.clientSecret) problems.push("clientSecret is required for secret auth")

   return { ok: problems.length === 0, problems }
}

/** Validate the active + retired keys parse, use a supported alg, and have unique kids. */
const validateKeys = (config: PrivateKeyAuthConfig, problems: string[]): void => {
   const
      inputs: { label: string, key: string | Buffer, kid?: string }[] = [
         { label: "privateKey", key: config.privateKey, kid: config.keyId },
         ...(config.retiredKeys ?? []).map((key, i) => ({ label: `retiredKeys[${i}]`, key })),
      ],
      kids = new Set<string>()
   for (const { label, key, kid } of inputs)
      try {
         const pem = resolvePrivateKey(key)
         keyAlg(pem) // throws on unsupported type/curve
         const id = kid ?? thumbprint(pem)
         if (kids.has(id)) problems.push(`duplicate kid "${id}" across keys`)
         kids.add(id)
      } catch (err) {
         problems.push(`${label}: ${(err as Error).message}`)
      }
}
