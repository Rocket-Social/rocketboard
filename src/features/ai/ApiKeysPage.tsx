import { useParams, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, KeyRound, Sparkles } from 'lucide-react'

import { Button } from '../../components/ui/button'
import { ApiKeySettings } from './components/ApiKeySettings'
import { useOrganizationRouteContextQuery } from '../org-settings/org-route.queries'
import { buildOrgSettingsHref } from '../shell/route-helpers'

export function ApiKeysPage() {
  const navigate = useNavigate()
  const { orgSlug } = useParams({ strict: false }) as { orgSlug?: string }
  const organizationQuery = useOrganizationRouteContextQuery(orgSlug)

  if (organizationQuery.isPending) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-canvas'>
        <p className='text-sm text-text-muted'>Loading API keys...</p>
      </div>
    )
  }

  if (!organizationQuery.data || !orgSlug) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-canvas'>
        <div className='text-center'>
          <p className='text-sm text-text-muted'>Organization not found or you don&apos;t have access.</p>
          <Button className='mt-4' onClick={() => navigate({ to: '/' })} variant='secondary'>
            Go back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-canvas'>
      <div className='mx-auto w-full max-w-4xl px-6 py-8'>
        <Button
          onClick={() => void navigate({ href: buildOrgSettingsHref(orgSlug) })}
          type='button'
          variant='ghost'
        >
          <ArrowLeft className='h-4 w-4'/>
          Settings
        </Button>

        <section className='mt-4 rounded-[32px] border border-border-subtle bg-surface-elevated p-6 shadow-panel'>
          <p className='font-mono text-xs uppercase tracking-[0.24em] text-text-muted'>
            Settings
          </p>

          <div className='mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
            <div className='flex items-start gap-4'>
              <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-canvas-accent text-text-strong'>
                <KeyRound className='h-5 w-5'/>
              </div>

              <div>
                <h1 className='font-display text-3xl font-semibold text-text-strong'>
                  API Keys
                </h1>
                <p className='mt-2 max-w-2xl text-sm leading-relaxed text-text-medium'>
                  Configure the provider keys Rocketboard uses for your AI agents in {organizationQuery.data.name}.
                  Charges go directly to your provider accounts.
                </p>
              </div>
            </div>

            <div className='inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary'>
              <Sparkles className='h-3.5 w-3.5'/>
              Personal keys
            </div>
          </div>
        </section>

        <div className='mt-6'>
          <ApiKeySettings organizationId={organizationQuery.data.id}/>
        </div>
      </div>
    </div>
  )
}
