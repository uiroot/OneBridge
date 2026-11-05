import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { Toaster } from 'sonner'
import logo from './assets/logo.png'
import { LoginModal } from './components/LoginModal'
import { PowerCountdownModal } from './components/PowerCountdownModal'
import { Sidebar } from './components/Sidebar'
import { TaskModal } from './components/TaskModal'
import { TitleBar } from './components/TitleBar'
import { Dashboard } from './pages/Dashboard'
import { FilesPage } from './pages/FilesPage'
import { SettingsPage } from './pages/SettingsPage'
import { TasksPage } from './pages/TasksPage'
import { TransfersPage } from './pages/TransfersPage'
import { bindAppEvents, useAppStore } from './store/app'

export function App(): React.JSX.Element {
  const bootstrapped = useAppStore((state) => state.bootstrapped)
  const bootError = useAppStore((state) => state.bootError)
  const page = useAppStore((state) => state.page)
  const config = useAppStore((state) => state.config)
  const init = useAppStore((state) => state.init)
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark')
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    void init()
    return bindAppEvents()
  }, [init])

  useEffect(() => {
    const theme = config?.settings.theme || 'dark'
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const next = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = next
      setResolvedTheme(next)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [config?.settings.theme])

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [page])

  if (!bootstrapped && !bootError) {
    return (
      <div className="app-shell">
        <TitleBar />
        <div className="flex flex-1 flex-col items-center justify-center gap-5">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl bg-sky-400/20 blur-2xl" />
            <img
              src={logo}
              alt="OneBridge"
              className="relative h-16 w-16 rounded-2xl shadow-2xl"
              style={{ animation: 'float 3s ease-in-out infinite' }}
            />
          </div>
          <div className="text-center">
            <div className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text)]">
              OneBridge
            </div>
            <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-[var(--text-muted)]">
              <Loader2 size={12} className="animate-spin" />
              正在启动同步引擎…
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (bootError) {
    return (
      <div className="app-shell">
        <TitleBar />
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="card max-w-[460px] p-6 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/10 text-[var(--danger-text)]">
              <AlertTriangle size={22} />
            </span>
            <h2 className="mt-4 text-[16px] font-semibold text-[var(--text)]">应用启动失败</h2>
            <p className="mt-2 break-words text-[11.5px] leading-relaxed text-[var(--text-muted)]">
              {bootError}
            </p>
            <button type="button" className="btn btn-primary mt-4" onClick={() => void init()}>
              <RefreshCw size={13} />
              重试
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main ref={mainRef} className="main-scroll">
          {renderPage(page)}
        </main>
      </div>
      <LoginModal />
      <PowerCountdownModal />
      <TaskModal />
      <Toaster
        theme={resolvedTheme}
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ duration: 4200 }}
      />
    </div>
  )
}

function renderPage(page: ReturnType<typeof useAppStore.getState>['page']): React.JSX.Element {
  switch (page) {
    case 'tasks':
      return <TasksPage />
    case 'files':
      return <FilesPage />
    case 'transfers':
      return <TransfersPage />
    case 'settings':
      return <SettingsPage />
    case 'dashboard':
    default:
      return <Dashboard />
  }
}
