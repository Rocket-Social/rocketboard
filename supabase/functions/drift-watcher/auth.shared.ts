// Shared input-validation helpers for the drift-watcher edge function.
//
// The previous service-role bearer-compare helpers (extractBearerToken,
// timingSafeEqual) were retired alongside the move to JWT role-claim
// auth — see `_shared/service-role-auth.ts`. Only UUID validation
// remains here.

// RFC 4122 / 9562 canonical UUID format (any version, any variant).
// Pure shape check — for service-role-locked surfaces we only care that
// the value would not throw a Postgres invalid-input error downstream.
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
