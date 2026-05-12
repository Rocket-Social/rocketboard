import {QueryClientProvider} from '@tanstack/react-query'
import {RouterProvider} from '@tanstack/react-router'

import {AuthSessionSync} from '../features/auth/AuthSessionSync'
import {ToastProvider} from '../components/ui/toast'
import {DISABLE_AUTH_SESSION_SYNC} from './config'
import {ModeProvider} from './mode'
import {queryClient} from './queryClient'
import {router} from './router'

export function AppProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      {DISABLE_AUTH_SESSION_SYNC ? null : <AuthSessionSync/>}
      <ModeProvider>
        <ToastProvider>
          <RouterProvider router={router}/>
        </ToastProvider>
      </ModeProvider>
    </QueryClientProvider>
  )
}
