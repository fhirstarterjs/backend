// Consumer fixture — public surface. Compiled against the PACKED tarball's published types.
// Backend exposes VALUES only (no named type exports), consistent with @fhirstarter/ehr;
// config types flow structurally from the default export. 2.0 is a plain call (no `new`).
import fhirStarter from "@fhirstarter/backend"

const auth = fhirStarter({
   clientId: "c",
   privateKey: "pem",
   tokenEndpointUrl: "https://auth.example/token",
   scopes: "system/*.read",
})

// Static helper is reachable off the default export.
const kid: string = fhirStarter.thumbprint("pem")

export { auth, kid }
