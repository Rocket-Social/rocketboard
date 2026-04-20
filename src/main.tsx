import React from 'react'
import ReactDOM from 'react-dom/client'

import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import '@fontsource/space-grotesk/latin-500.css'
import '@fontsource/space-grotesk/latin-700.css'

import {AppErrorPage} from './app/AppErrorPage'
import {AppProviders} from './app/AppProviders'
import {devAutoLogin} from './features/auth/DevAutoLogin'
import {captureException, initMonitoring} from './platform/monitoring'
import './styles/tailwind.css'

initMonitoring()

async function boot() {
  await devAutoLogin()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppProviders/>
    </React.StrictMode>,
  )
}

void boot().catch((error) => {
  console.error('[boot]', error)
  captureException(error, {boundary: 'boot'})

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppErrorPage error={error}/>
    </React.StrictMode>,
  )
})
