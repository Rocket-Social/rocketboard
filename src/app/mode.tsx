import {createContext, useContext, useEffect, useState, type ReactNode} from 'react'

export type Mode = 'light' | 'ember' | 'dark'

const MODE_STORAGE_KEY = 'rocketboard.mode'

const validModes: Mode[] = ['light', 'ember', 'dark']

function readInitialMode(): Mode {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const storedMode = window.localStorage.getItem(MODE_STORAGE_KEY)

  if (storedMode && validModes.includes(storedMode as Mode)) {
    return storedMode as Mode
  }

  return 'light'
}

const themeColors: Record<Mode, string> = {
  light: '#f8fafc',
  ember: '#f2eee6',
  dark: '#0f1115',
}

type ModeContextValue = {
  mode: Mode
  setMode: (mode: Mode) => void
}

const ModeContext = createContext<ModeContextValue | null>(null)

export function ModeProvider({children}: {children: ReactNode}) {
  const [mode, setMode] = useState<Mode>(() => readInitialMode())

  useEffect(() => {
    const root = document.documentElement
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')

    root.dataset.mode = mode
    root.style.colorScheme = mode === 'dark' ? 'dark' : 'light'

    if (themeMeta) {
      themeMeta.setAttribute('content', themeColors[mode])
    }

    window.localStorage.setItem(MODE_STORAGE_KEY, mode)
  }, [mode])

  return (
    <ModeContext.Provider value={{mode, setMode}}>
      {children}
    </ModeContext.Provider>
  )
}

export function useMode() {
  const context = useContext(ModeContext)

  if (!context) {
    throw new Error('useMode must be used within ModeProvider')
  }

  return context
}
