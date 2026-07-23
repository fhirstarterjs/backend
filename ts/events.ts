/** Invoke every listener in a set with `arg`, swallowing individual listener failures. */
export const emit = <T>(listeners: Set<(arg: T) => void>, arg: T): void => {
   for (const fn of listeners)
      try {
         fn(arg)
      } catch {
         /* ignore listener failures — auth lifecycle must continue */
      }
}

/** Invoke every no-arg listener in a set, swallowing individual listener failures. */
export const emitVoid = (listeners: Set<() => void>): void => {
   for (const fn of listeners)
      try {
         fn()
      } catch {
         /* ignore listener failures — auth lifecycle must continue */
      }
}

/** Add `listener` to `set` and return an idempotent unsubscribe. */
export const subscribe = <T>(set: Set<T>, listener: T): (() => void) => (
   set.add(listener), () => void set.delete(listener)
)

/** Reduce an unknown error to a redacted {@link RefreshError} (no tokens/secrets). */
export const toRefreshError = (err: unknown): RefreshError => {
   const
      raw = err instanceof Error ? err.message : String(err),
      match = raw.match(/failed \((\d{3})\)/),
      message = raw.replace(/(client_assertion|client_secret|access_token)=[^&\s]+/gi, "$1=<redacted>")
   return match ? { message, status: Number(match[1]) } : { message }
}
