// Shared input-validation helpers for the ai-agent-run edge function.
//
// The previous service-role bearer-compare helpers (extractBearerToken,
// timingSafeEqual) were retired alongside the move to JWT role-claim
// auth — see `_shared/service-role-auth.ts`. Only UUID validation
// remains here.

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
