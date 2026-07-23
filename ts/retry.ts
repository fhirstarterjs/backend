/** True if an HTTP status is worth retrying (transient): 408, 429, or 5xx. */
export const retryableStatus = (status: number): boolean =>
   status === 408 || status === 429 || (status >= 500 && status < 600)

/** Compose a per-attempt AbortSignal from the caller signal plus a timeout. */
export const attemptSignal = (caller: AbortSignal | undefined, timeoutMs: number): AbortSignal =>
   caller ? AbortSignal.any([caller, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) into ms, or null. */
export const retryAfterMs = (header: string | null): number | null => {
   if (!header) return null
   const secs = Number(header)
   if (Number.isFinite(secs)) return Math.max(0, secs * 1000)
   const when = Date.parse(header)
   return Number.isNaN(when) ? null : Math.max(0, when - Date.now())
}

/** Sleep for `ms`, rejecting early if `signal` aborts. */
export const abortableSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
   new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason)
      const
         timer = setTimeout(() => (cleanup(), resolve()), ms),
         onAbort = () => (cleanup(), reject(signal!.reason)),
         cleanup = () => (clearTimeout(timer), signal?.removeEventListener("abort", onAbort))
      signal?.addEventListener("abort", onAbort, { once: true })
   })

/** Exponential backoff with full jitter, honoring an optional server-provided delay. */
export const backoffDelay = (attempt: number, baseMs: number, serverMs: number | null): number =>
   serverMs ?? Math.round(Math.random() * baseMs * 2 ** attempt)
