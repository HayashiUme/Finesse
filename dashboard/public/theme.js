// Apply the theme before the page renders, and share one store with React.
(() => {
  const storageKey = 'finesse-theme'
  const accentKey = 'finesse-accent-color'
  const wallpaperKey = 'finesse-wallpaper'
  const defaultWallpaper = "url('/images/acg-spring-meadow.jpg')"
  const valid = value => ['light', 'dark', 'system'].includes(value)
  const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  let preference = 'system'
  let accent = '#39c5bb'
  let wallpaper = null
  try {
    const saved = localStorage.getItem(storageKey)
    if (valid(saved)) preference = saved
    const savedAccent = localStorage.getItem(accentKey)
    if (validColor(savedAccent)) accent = savedAccent
    const savedWallpaper = localStorage.getItem(wallpaperKey)
    if (validWallpaper(savedWallpaper)) wallpaper = savedWallpaper
  } catch { /* The theme still works without browser storage. */ }

  function validWallpaper(value) {
    return typeof value === 'string' && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/]+=*$/i.test(value) && value.length <= 1_700_000
  }

  function apply() {
    const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.themePreference = preference
    document.documentElement.style.colorScheme = theme
    document.documentElement.style.setProperty('--accent-color', accent)
    document.documentElement.style.setProperty('--wallpaper-image', wallpaper ? `url("${wallpaper}")` : defaultWallpaper)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171e1c' : '#f6f7f5')
    window.dispatchEvent(new Event('finesse-theme-change'))
  }

  window.finesseTheme = {
    getPreference: () => preference,
    getAccent: () => accent,
    getWallpaper: () => wallpaper,
    setPreference(value) {
      if (!valid(value)) return
      preference = value
      try { localStorage.setItem(storageKey, value) } catch { /* Keep the in-memory preference. */ }
      apply()
    },
    setAccent(value) {
      if (!validColor(value)) return
      accent = value.toLowerCase()
      try { localStorage.setItem(accentKey, accent) } catch { /* Keep the in-memory preference. */ }
      apply()
    },
    setWallpaper(value) {
      if (value !== null && !validWallpaper(value)) return
      wallpaper = value
      try {
        if (wallpaper) localStorage.setItem(wallpaperKey, wallpaper)
        else localStorage.removeItem(wallpaperKey)
      } catch { /* The caller handles storage errors before committing. */ }
      apply()
    },
  }
  media.addEventListener('change', () => { if (preference === 'system') apply() })
  window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage || (event.key !== storageKey && event.key !== accentKey && event.key !== wallpaperKey && event.key !== null)) return
    if (event.key === accentKey || event.key === null) accent = validColor(event.newValue) ? event.newValue.toLowerCase() : '#39c5bb'
    if (event.key === storageKey || event.key === null) preference = valid(event.newValue) ? event.newValue : 'system'
    if (event.key === wallpaperKey || event.key === null) wallpaper = validWallpaper(event.newValue) ? event.newValue : null
    apply()
  })
  apply()
})()
