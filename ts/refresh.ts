import { requestToken } from "./token.js"

/** Invoke all refresh callbacks with the new token; callback failures never break auth. */
export const notifyRefresh = (state: ProviderState, token: string): void => {
   for (const cb of state.refreshCallbacks)
      try {
         cb(token)
      } catch {
         /* ignore callback failures — auth lifecycle must continue */
      }
}

/** Single-flight refresh: coalesce concurrent callers onto one in-flight request. */
export const doRefresh = (config: AuthConfig, state: ProviderState, cred: ResolvedCredential): Promise<string> =>
   (state.refreshPromise ??= requestToken(config, state, cred)
      .then((cache) => {
         state.cache = cache
         state.refreshPromise = null
         state.refreshFailed = false
         state.refreshRetryMs = 5_000
         notifyRefresh(state, cache.accessToken)
         if (state.started) scheduleRefresh(config, state, cred)
         return cache.accessToken
      })
      .catch((err) => {
         state.refreshPromise = null
         throw err
      }))

/** Schedule the next proactive refresh (or a backoff retry after a failure). */
export const scheduleRefresh = (config: AuthConfig, state: ProviderState, cred: ResolvedCredential): void => {
   if (!state.started) return
   if (state.refreshTimer) clearTimeout(state.refreshTimer)
   const delay =
      !state.cache || state.refreshFailed
         ? state.refreshRetryMs
         : Math.max(1_000, state.cache.refreshAt - Date.now())
   state.refreshTimer = setTimeout(async () => {
      try {
         await doRefresh(config, state, cred)
      } catch {
         state.refreshFailed = true
         state.refreshRetryMs = Math.min(state.refreshRetryMs * 2, 60_000)
         scheduleRefresh(config, state, cred)
      }
   }, delay)
   state.refreshTimer.unref?.()
}
