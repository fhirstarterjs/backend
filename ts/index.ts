import { validateConfig } from "./config.js"
import { thumbprint } from "./jwt.js"
import { getJwks } from "./jwks.js"
import { memoryStore } from "./store.js"
import { subscribe } from "./events.js"
import { validate } from "./validate.js"
import { doRefresh, scheduleRefresh } from "./refresh.js"

/**
 * Create a SMART Backend Services auth provider.
 *
 * Manages client-credentials token acquisition and proactive refresh. Uses private-key JWT
 * client assertions (RFC 7523) by default, or a client secret for non-SMART OAuth servers.
 * Each call returns an independent provider closing over its own private state, so one
 * process can run many providers.
 * @param config - Auth configuration (client ID, credential, token endpoint, scopes).
 * @throws If any required field is missing, blank, or invalid.
 */
const fhirStarter = (config: AuthConfig): Provider => {
   const
      cred = validateConfig(config),
      state: ProviderState = {
         cache: null,
         refreshPromise: null,
         startPromise: null,
         refreshTimer: null,
         privateKeyObj: null,
         started: false,
         refreshFailed: false,
         refreshRetryMs: 5_000,
         acquiredOnce: false,
         refreshCallbacks: new Set(),
         startListeners: new Set(),
         endListeners: new Set(),
         errorListeners: new Set(),
      },

      valid = (): TokenCache | null =>
         state.cache && Date.now() < state.cache.expiresAt ? state.cache : null,

      getAccessToken = async (): Promise<string> => {
         if (state.cache && Date.now() < state.cache.refreshAt) return state.cache.accessToken
         const stale = state.cache
         try {
            return await doRefresh(config, state, cred)
         } catch (err) {
            if (stale && Date.now() < stale.expiresAt) return stale.accessToken
            throw err
         }
      },

      tokenResponse = (): LiveTokenResponse => ({
         token_type: "bearer",
         get access_token() {
            return valid()?.accessToken ?? undefined
         },
         get expires_in() {
            const c = valid()
            return c ? Math.ceil((c.expiresAt - Date.now()) / 1000) : undefined
         },
         get scope() {
            return state.cache?.scope
         },
      })

   return {
      get serverUrl() {
         return config.serverUrl
      },
      get accessToken() {
         return valid()?.accessToken ?? null
      },
      get expiresAt() {
         return valid()?.expiresAt ?? null
      },
      get token() {
         return valid()?.accessToken ?? null
      },
      get expiresIn() {
         const c = valid()
         return c ? Math.ceil((c.expiresAt - Date.now()) / 1000) : null
      },
      get authorizationHeader() {
         const t = valid()?.accessToken
         return t ? `Bearer ${t}` : null
      },
      getAccessToken,
      start: (): Promise<void> => {
         if (state.started) return Promise.resolve()
         return (state.startPromise ??= (async () => {
            state.refreshRetryMs = 5_000
            state.refreshFailed = false
            try {
               await getAccessToken()
               state.started = true
               scheduleRefresh(config, state, cred)
            } finally {
               state.startPromise = null
            }
         })())
      },
      stop: (): void => {
         state.started = false
         state.refreshTimer && (clearTimeout(state.refreshTimer), (state.refreshTimer = null))
      },
      tokenResponse,
      get fhirClient() {
         return { serverUrl: config.serverUrl, tokenResponse: tokenResponse() }
      },
      get authHeaders() {
         const t = valid()?.accessToken
         return (t ? { Authorization: `Bearer ${t}` } : {}) as AuthHeaders
      },
      onRefresh: (callback: RefreshCallback) => subscribe(state.refreshCallbacks, callback),
      onRefreshStart: (callback: () => void) => subscribe(state.startListeners, callback),
      onRefreshEnd: (callback: () => void) => subscribe(state.endListeners, callback),
      onError: (callback: (error: RefreshError) => void) => subscribe(state.errorListeners, callback),
      validate: (): ValidationResult => validate(config),
      getJwks: (): Promise<JwkSet> => getJwks(config, cred),
   }
}

fhirStarter.thumbprint = (privateKey: string | Buffer): string => thumbprint(privateKey)
fhirStarter.memoryStore = (): TokenStore => memoryStore()

export default fhirStarter
