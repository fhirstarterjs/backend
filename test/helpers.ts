import { generateKeyPairSync } from "node:crypto"

/** Generate a fresh RSA PKCS#8 PEM string for use as a test private key. */
export const testKeyPem = (): string =>
   generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
   }).privateKey

/** Build a minimal valid private-key AuthConfig around a generated key. */
export const testConfig = (over: Partial<PrivateKeyAuthConfig> = {}): PrivateKeyAuthConfig => ({
   clientId: "test-client",
   privateKey: testKeyPem(),
   tokenEndpointUrl: "https://auth.example/token",
   scopes: "system/*.read",
   ...over,
})

/** Install a fake `fetch` returning queued token responses; returns a controller. */
export const mockTokenEndpoint = (): TokenEndpointMock => {
   const
      calls: URLSearchParams[] = [],
      headers: Record<string, string>[] = [],
      queue: (() => TokenFetchResult)[] = [],
      original = globalThis.fetch,
      restore = (): void => void (globalThis.fetch = original)

   globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      calls.push(new URLSearchParams((init?.body as string) ?? ""))
      headers.push((init?.headers as Record<string, string>) ?? {})
      const next = queue.shift()
      if (!next) throw new Error("mockTokenEndpoint: no queued response")
      const { status, body } = next()
      return {
         ok: status >= 200 && status < 300,
         status,
         json: async () => body,
         text: async () => JSON.stringify(body),
      }
   }) as typeof fetch

   return {
      calls,
      headers,
      restore,
      reply: (body: object, status = 200) => void queue.push(() => ({ status, body })),
      fail: (status = 500, body: object = { error: "server_error" }) =>
         void queue.push(() => ({ status, body })),
      throwNetwork: (message = "network down") =>
         void queue.push(() => {
            throw new Error(message)
         }),
   }
}

/** Standard successful token body with a configurable ttl in seconds. */
export const tokenBody = (expiresIn: number, over: object = {}): object => ({
   access_token: `tok-${Math.random().toString(36).slice(2, 8)}`,
   token_type: "bearer",
   expires_in: expiresIn,
   scope: "system/*.read",
   ...over,
})
