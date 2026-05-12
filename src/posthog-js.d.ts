declare module 'posthog-js' {
  type PostHogProperties = Record<string, unknown>

  interface PostHogClient {
    init(apiKey: string, options?: Record<string, unknown>): void
    register(properties: PostHogProperties): void
    capture(event: string, properties?: PostHogProperties): void
    captureException(error: unknown, properties?: PostHogProperties): void
    identify(distinctId: string, properties?: PostHogProperties): void
    reset(): void
  }

  const posthog: PostHogClient

  export default posthog
}
