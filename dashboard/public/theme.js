// Apply the theme before the page renders, and share one store with React.
(() => {
  const storageKey = 'finesse-theme'
  const valid = value => ['light', 'dark', 'system'].includes(value)
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  let preference = 'system'
  try {
    const saved = localStorage.getItem(storageKey)
    if (valid(saved)) preference = saved
  } catch { /* The theme still works without browser storage. */ }

  function apply() {
    const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.themePreference = preference
    document.documentElement.style.colorScheme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171e1c' : '#f6f7f5')
    window.dispatchEvent(new Event('finesse-theme-change'))
  }

  window.finesseTheme = {
    getPreference: () => preference,
    setPreference(value) {
      if (!valid(value)) return
      preference = value
      try { localStorage.setItem(storageKey, value) } catch { /* Keep the in-memory preference. */ }
      apply()
    },
  }
  media.addEventListener('change', () => { if (preference === 'system') apply() })
  window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage || (event.key !== storageKey && event.key !== null)) return
    preference = valid(event.newValue) ? event.newValue : 'system'
    apply()
  })
  apply()
})()
