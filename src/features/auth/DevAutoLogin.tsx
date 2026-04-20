import {authAdapter} from '../../platform/auth/auth-adapter'
import {appConfig} from '../../app/config'

const DEV_AUTO_LOGIN_ENABLED = import.meta.env.VITE_DEV_AUTO_LOGIN === 'true'
const DEMO_EMAIL = import.meta.env.VITE_DEV_AUTO_LOGIN_EMAIL ?? ''
const DEMO_PASSWORD = import.meta.env.VITE_DEV_AUTO_LOGIN_PASSWORD ?? ''

const isLocalSupabase =
  appConfig.supabase.url?.includes('127.0.0.1')
  || appConfig.supabase.url?.includes('localhost')

/**
 * Auto-signs in with the demo account before the app renders.
 * Must be called and awaited before ReactDOM.createRoot().
 * Only activates when VITE_DEV_AUTO_LOGIN=true + local Supabase.
 */
export async function devAutoLogin(): Promise<void> {
  if (!DEV_AUTO_LOGIN_ENABLED || !isLocalSupabase) {
    return
  }

  const {data} = await authAdapter.getSession()

  if (data.session) {
    return // already signed in
  }

  const {error} = await authAdapter.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  })

  if (error) {
    console.warn('[dev-auto-login] Failed:', error.message)
  } else {
    console.info('[dev-auto-login] Signed in as', DEMO_EMAIL)
  }
}
