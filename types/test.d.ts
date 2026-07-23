/** Result of a single mocked token-endpoint fetch. */
interface TokenFetchResult {
   status: number
   body: object
}

/** Controller returned by `mockTokenEndpoint` for driving fetch behavior in tests. */
interface TokenEndpointMock {
   /** Bodies of each token request received, parsed as form params. */
   calls: URLSearchParams[]
   /** Restore the original global `fetch`. */
   restore: () => void
   /** Queue a successful (or explicit-status) JSON response. */
   reply: (body: object, status?: number) => void
   /** Queue a non-2xx JSON response. */
   fail: (status?: number, body?: object) => void
   /** Queue a fetch that throws a network error. */
   throwNetwork: (message?: string) => void
}
