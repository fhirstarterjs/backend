// Consumer fixture — public surface. Compiled against the PACKED tarball's published types.
// Backend exposes VALUES only (no named type exports), consistent with @fhirstarter/ehr;
// config types flow structurally from the default export. Callable as a constructor in v1
// (becomes a plain call in 2.0).
import fhirStarter from "@fhirstarter/backend"

const auth = new fhirStarter({
   clientId: "c",
   privateKey: "pem",
   tokenEndpointUrl: "https://auth.example/token",
   scopes: "system/*.read",
})

// Static helper is reachable off the default export.
const kid: string = fhirStarter.thumbprint("pem")

export { auth, kid }
