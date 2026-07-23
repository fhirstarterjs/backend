// Consumer fixture — KNOWN DEFECT surface (v1). The README advertises named type imports,
// but `types/index.d.ts` only re-exports `default`; the interfaces in `api.d.ts` are ambient
// globals, so these named imports DO NOT resolve from the package. Each line below is
// expected to error today. The type-surface test asserts these errors EXIST (passing
// negative test). Slice 7 will repair the exports and flip this fixture to expect success.
import type { AuthConfig, Provider, JwkSet, LiveTokenResponse } from "@fhirstarter/backend"

export type A = AuthConfig
export type P = Provider
export type J = JwkSet
export type L = LiveTokenResponse
