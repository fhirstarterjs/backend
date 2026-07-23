import { coordinatedRequest } from "./coordinate.js"
import { emit, emitVoid, toRefreshError } from "./events.js"

/** Single-flight refresh: coalesce concurrent callers onto one in-flight request. */
export const doRefresh = (config: AuthConfig, state: ProviderState, cred: ResolvedCredential): Promise<string> => {
   if (state.refreshPromise) return state.refreshPromise
   emitVoid(state.startListeners)
   return (state.refreshPromise = coordinatedRequest(config, state, cred)
      .then((cache) => {
         const reacquisition = state.acquiredOnce
         state.cache = cache
         state.refreshPromise = null
         state.refreshFailed = false
         state.refreshRetryMs = 5_000
         state.acquiredOnce = true
         if (reacquisition) emit(state.refreshCallbacks, cache.accessToken)
         if (state.started) scheduleRefresh(config, state, cred)
         return cache.accessToken
      })
      .catch((err) => {
         state.refreshPromise = null
         emit(state.errorListeners, toRefreshError(err))
         throw err
      })
      .finally(() => emitVoid(state.endListeners)))
}

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
