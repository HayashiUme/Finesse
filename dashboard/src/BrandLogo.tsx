import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('finesse-theme-change', onChange)
  return () => window.removeEventListener('finesse-theme-change', onChange)
}

export default function BrandLogo() {
  const logo = useSyncExternalStore(subscribe, window.finesseTheme.getLogo)
  return <img className="brand-logo" src={logo} alt="" />
}
