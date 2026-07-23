import { validateConfig } from "./config.js"
import { getJwks, thumbprint } from "./jwt.js"
import { doRefresh, scheduleRefresh } from "./refresh.js"

/**
 * Create a SMART Backend Services auth provider.
 *
 * Manages client-credentials token acquisition and proactive refresh using a private RSA key
 * and the JWT Bearer client-assertion flow (RFC 7523). Each call returns an independent
 * provider closing over its own private state, so one process can run many providers.
 * @param config - Auth configuration (client ID, private key, token endpoint, scopes).
 * @throws If any required field is missing, blank, or invalid.
 */
const fhirStarter = (config: AuthConfig): Provider => {
   const
      pem = validateConfig(config),
      state: ProviderState = {
         cache: null,
         refreshPromise: null,
         startPromise: null,
         refreshTimer: null,
         privateKeyObj: null,
         started: false,
         refreshFailed: false,
         refreshRetryMs: 5_000,
         refreshCallbacks: new Set(),
      },

      valid = (): TokenCache | null =>
         state.cache && Date.now() < state.cache.expiresAt ? state.cache : null,

      getAccessToken = async (): Promise<string> => {
         if (state.cache && Date.now() < state.cache.refreshAt) return state.cache.accessToken
         const stale = state.cache
         try {
            return await doRefresh(config, state, pem)
         } catch (err) {
            if (stale && Date.now() < stale.expiresAt) return stale.accessToken
            throw err
         }
      }

   return {
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
               scheduleRefresh(config, state, pem)
            } finally {
               state.startPromise = null
            }
         })())
      },
      stop: (): void => {
         state.started = false
         state.refreshTimer && (clearTimeout(state.refreshTimer), (state.refreshTimer = null))
      },
      tokenResponse: (): LiveTokenResponse => ({
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
      }),
      onRefresh: (callback: RefreshCallback): (() => void) => {
         state.refreshCallbacks.add(callback)
         const current = valid()?.accessToken
         if (current)
            try {
               callback(current)
            } catch {
               /* ignore */
            }
         return () => void state.refreshCallbacks.delete(callback)
      },
      getJwks: (): Promise<JwkSet> => getJwks(config, state, pem),
   }
}

fhirStarter.thumbprint = thumbprint

export default fhirStarter
