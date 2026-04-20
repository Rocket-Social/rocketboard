import { anthropicSubscriptionFeatureFlagKey } from '../../../src/features/ai/anthropic-auth.shared.ts'
import { createServiceClient } from './supabase.ts'

export async function getFeatureFlag(key: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('app_feature_flags')
    .select('enabled')
    .eq('key', key)
    .maybeSingle()

  return Boolean(data?.enabled)
}

export async function getAnthropicSubscriptionFeatureEnabled() {
  return getFeatureFlag(anthropicSubscriptionFeatureFlagKey)
}
