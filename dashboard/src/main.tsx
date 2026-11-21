import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './themes.css'
import './styles.css'
import './servers.css'
import './accounts.css'
import './i18n'

async function registerDashboardUpdates() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
  let hasController = Boolean(navigator.serviceWorker.controller)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasController) window.location.reload()
    hasController = true
  })
  const workerUrl = `${import.meta.env.BASE_URL}service-worker.js?v=${encodeURIComponent(__FINESSE_VERSION__)}`
  const registration = await navigator.serviceWorker.register(workerUrl, { updateViaCache: 'none' })
  await registration.update()
  window.setInterval(() => { void registration.update() }, 60 * 60 * 1000)
}

void registerDashboardUpdates().catch(() => { /* The dashboard remains usable when service workers are unavailable. */ })

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
