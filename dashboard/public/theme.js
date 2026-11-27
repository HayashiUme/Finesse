// Apply the saved appearance before React renders to avoid a theme flash.
(() => {
  const keys = {
    preference: 'finesse-theme',
    accent: 'finesse-accent-color',
    wallpaper: 'finesse-wallpaper',
    logo: 'finesse-logo',
    name: 'finesse-theme-name',
  }
  const defaults = {
    name: 'Hatsune Miku',
    accent: '#39c5bb',
    logo: '/images/miku-acg-icon.png',
    wallpaper: '/images/miku-acg-background.jpg',
  }
  const validPreference = value => ['light', 'dark', 'system'].includes(value)
  const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
  const validImage = (value, maxLength = 1_700_000) => typeof value === 'string' && value.length <= maxLength && (
    /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/]+=*$/i.test(value) || /^\/images\/[a-z0-9._/-]+$/i.test(value)
  )
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  let preference = 'system'
  let { ...appearance } = defaults
  try {
    const savedPreference = localStorage.getItem(keys.preference)
    if (validPreference(savedPreference)) preference = savedPreference
    const accent = localStorage.getItem(keys.accent)
    const wallpaper = localStorage.getItem(keys.wallpaper)
    const logo = localStorage.getItem(keys.logo)
    const name = localStorage.getItem(keys.name)
    if (validColor(accent)) appearance.accent = accent.toLowerCase()
    if (validImage(wallpaper)) appearance.wallpaper = wallpaper
    if (validImage(logo, 700_000)) appearance.logo = logo
    if (typeof name === 'string' && name.length > 0 && name.length <= 40) appearance.name = name
    // Replace the former built-in Finesse character preset for existing browsers.
    if (appearance.name === 'Finesse') {
      appearance = { ...defaults }
      persist(keys.name, appearance.name)
      persist(keys.accent, appearance.accent)
      persist(keys.logo, appearance.logo)
      persist(keys.wallpaper, appearance.wallpaper)
    }
  } catch { /* Keep defaults when browser storage is unavailable. */ }

  function persist(key, value) {
    try {
      if (value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch { /* Keep the current appearance in memory. */ }
  }

  function apply() {
    const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference
    const root = document.documentElement
    root.dataset.theme = theme
    root.dataset.themePreference = preference
    root.dataset.appearanceName = appearance.name
    root.style.colorScheme = theme
    root.style.setProperty('--accent-color', appearance.accent)
    root.style.setProperty('--wallpaper-image', appearance.wallpaper ? `url("${appearance.wallpaper}")` : "url('/images/miku-acg-background.jpg')")
    root.style.setProperty('--brand-image', `url("${appearance.logo}")`)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171e1c' : '#f6f7f5')
    window.dispatchEvent(new Event('finesse-theme-change'))
  }

  window.finesseTheme = {
    getPreference: () => preference,
    getAccent: () => appearance.accent,
    getWallpaper: () => appearance.wallpaper,
    getLogo: () => appearance.logo,
    getName: () => appearance.name,
    getAppearance: () => ({ ...appearance }),
    setPreference(value) {
      if (!validPreference(value)) return
      preference = value
      persist(keys.preference, value)
      apply()
    },
    setAccent(value) {
      if (!validColor(value)) return
      appearance.accent = value.toLowerCase()
      appearance.name = 'Custom'
      persist(keys.accent, appearance.accent)
      persist(keys.name, appearance.name)
      apply()
    },
    setWallpaper(value) {
      if (value !== null && !validImage(value)) return
      appearance.wallpaper = value
      appearance.name = 'Custom'
      persist(keys.wallpaper, value)
      persist(keys.name, appearance.name)
      apply()
    },
    setLogo(value) {
      if (!validImage(value, 700_000)) return
      appearance.logo = value
      appearance.name = 'Custom'
      persist(keys.logo, value)
      persist(keys.name, appearance.name)
      apply()
    },
    setTheme(value) {
      if (!value || typeof value.name !== 'string' || value.name.length > 40 || !validColor(value.accent) || !validImage(value.logo, 700_000) || (value.wallpaper !== null && !validImage(value.wallpaper))) return false
      appearance = { name: value.name, accent: value.accent.toLowerCase(), logo: value.logo, wallpaper: value.wallpaper }
      persist(keys.name, appearance.name)
      persist(keys.accent, appearance.accent)
      persist(keys.logo, appearance.logo)
      persist(keys.wallpaper, appearance.wallpaper)
      apply()
      return true
    },
  }

  media.addEventListener('change', () => { if (preference === 'system') apply() })
  window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage || !Object.values(keys).includes(event.key) && event.key !== null) return
    if (event.key === keys.preference || event.key === null) preference = validPreference(event.newValue) ? event.newValue : 'system'
    if (event.key === keys.accent || event.key === null) appearance.accent = validColor(event.newValue) ? event.newValue.toLowerCase() : defaults.accent
    if (event.key === keys.wallpaper || event.key === null) appearance.wallpaper = validImage(event.newValue) ? event.newValue : null
    if (event.key === keys.logo || event.key === null) appearance.logo = validImage(event.newValue, 700_000) ? event.newValue : defaults.logo
    if (event.key === keys.name || event.key === null) appearance.name = event.newValue || defaults.name
    apply()
  })
  apply()
})()
