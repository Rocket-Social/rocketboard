import { AlertTriangle, CheckCircle2 } from 'lucide-react'

type ApiKeyStatusBannerProps = {
  configuredProviders: string[]
}

export function ApiKeyStatusBanner({ configuredProviders }: ApiKeyStatusBannerProps) {
  const hasAnyKey = configuredProviders.length > 0

  return (
    <div className={`rounded-2xl border px-4 py-3 ${hasAnyKey ? 'border-success/20 bg-success/10' : 'border-warning/20 bg-warning/10'}`}>
      <div className='flex items-start gap-3'>
        {hasAnyKey ? (
          <CheckCircle2 className='mt-0.5 h-5 w-5 shrink-0 text-success'/>
        ) : (
          <AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-warning'/>
        )}
        <div>
          <p className={`text-sm font-medium ${hasAnyKey ? 'text-success' : 'text-warning'}`}>
            {hasAnyKey ? 'API keys configured' : 'No API keys configured yet'}
          </p>
          <p className={`mt-1 text-sm ${hasAnyKey ? 'text-success' : 'text-warning'}`}>
            {hasAnyKey
              ? `${configuredProviders.join(', ')} ${configuredProviders.length === 1 ? 'is' : 'are'} ready for AI agents.`
              : 'Add a provider key below to enable AI agents in this organization.'}
          </p>
        </div>
      </div>
    </div>
  )
}
