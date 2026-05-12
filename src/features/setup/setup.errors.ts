export function getSetupErrorMessage(
  error: unknown,
  fallback = 'Rocketboard could not complete that action.',
) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const objectError = error as Record<string, unknown>

    if (typeof objectError.message === 'string' && objectError.message.trim().length > 0) {
      return objectError.message
    }

    if (typeof objectError.details === 'string' && objectError.details.trim().length > 0) {
      return objectError.details
    }

    if (typeof objectError.hint === 'string' && objectError.hint.trim().length > 0) {
      return objectError.hint
    }
  }

  return fallback
}
