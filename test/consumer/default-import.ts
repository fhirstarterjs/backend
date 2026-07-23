// Consumer fixture — WORKING surface. Compiled against the PACKED tarball's published
// types, not repo-local ambient declarations. The default import must resolve and be
// callable as a constructor in v1 (this becomes a plain call in 2.0).
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
