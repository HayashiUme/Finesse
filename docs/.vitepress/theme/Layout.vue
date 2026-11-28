<script setup lang="ts">
import { computed, ref } from 'vue'
import { useData, withBase } from 'vitepress'
import { data as documents } from './documents.data'

const { frontmatter, page, site, isDark } = useData()
const mobileOpen = ref(false)
const query = ref('')
const locale = computed(() => page.value.relativePath.startsWith('zh-CN/') ? 'zh-CN' : 'en')
const chinese = computed(() => locale.value === 'zh-CN')
const localeRoot = computed(() => chinese.value ? '/zh-CN/' : '/en/')
type NavItem = { text: string; link: string }
type NavGroup = { text: string; items: NavItem[] }
const sidebar = computed(() => {
  const groups: NavGroup[] = site.value.themeConfig.sidebar?.[localeRoot.value] ?? []
  const listed = new Set(groups.flatMap(group => group.items.map(item => item.link)))
  const additional = documents.filter(({ link }) =>
    link.startsWith(localeRoot.value) && link !== localeRoot.value && !listed.has(link),
  )
  return additional.length
    ? [...groups, { text: chinese.value ? '更多文档' : 'More docs', items: additional }]
    : groups
})
const currentLink = computed(() => '/' + page.value.relativePath
  .replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, ''))
const activeTitle = computed(() => frontmatter.value.title || page.value.title || (chinese.value ? '文档' : 'Documentation'))
const visibleGroups = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle) return sidebar.value
  return sidebar.value.map(group => ({ ...group, items: group.items.filter(item => item.text.toLocaleLowerCase().includes(needle)) })).filter(group => group.items.length)
})
const languageLink = computed(() => {
  const targetPrefix = chinese.value ? '/en/' : '/zh-CN/'
  const counterpart = targetPrefix + (currentLink.value.startsWith(localeRoot.value)
    ? currentLink.value.slice(localeRoot.value.length)
    : '')
  return withBase(documents.some(({ link }) => link === counterpart) ? counterpart : targetPrefix)
})
const toggleTheme = () => { isDark.value = !isDark.value }
</script>

<template>
  <div class="finesse-docs" :style="{ '--wallpaper-image': `url(${withBase('/images/miku-acg-background.jpg')})` }" :class="{ 'mobile-open': mobileOpen, 'is-home': frontmatter.layout === 'home' }">
    <button v-if="mobileOpen" class="mobile-scrim" aria-label="Close navigation" @click="mobileOpen = false" />
    <aside class="docs-sidebar">
      <a class="brand" :href="withBase(localeRoot)" :aria-label="chinese ? 'Finesse 文档首页' : 'Finesse documentation home'">
        <img :src="withBase('/images/miku-acg-icon.png')" alt="" />
        <span><strong>Finesse</strong><small>{{ chinese ? '文档中心' : 'Documentation' }}</small></span>
      </a>
      <div class="sidebar-caption">{{ chinese ? '文档导航' : 'Documentation' }}</div>
      <label class="docs-search"><span>⌕</span><input v-model="query" :placeholder="chinese ? '搜索文档' : 'Search docs'" /></label>
      <nav class="docs-nav" :aria-label="chinese ? '文档导航' : 'Documentation navigation'">
        <section v-for="group in visibleGroups" :key="group.text" class="nav-group">
          <h2>{{ group.text }}</h2>
          <a v-for="item in group.items" :key="item.link" :href="withBase(item.link)" :class="{ active: currentLink === item.link }" :aria-current="currentLink === item.link ? 'page' : undefined" @click="mobileOpen = false">{{ item.text }}</a>
        </section>
      </nav>
      <a class="sidebar-github" href="https://github.com/HayashiUme/Finesse" target="_blank" rel="noreferrer">
        <span class="github-mark">↗</span><span>{{ chinese ? '在 GitHub 上查看' : 'View on GitHub' }}</span><span class="external">↗</span>
      </a>
    </aside>

    <main class="docs-main">
      <header class="docs-topbar">
        <button class="mobile-menu" :aria-label="chinese ? '打开导航' : 'Open navigation'" @click="mobileOpen = true">☰</button>
        <div class="breadcrumbs"><a :href="withBase(localeRoot)">Finesse</a><span>/</span><strong>{{ activeTitle }}</strong></div>
        <div class="top-actions">
          <a class="top-button language-button" :href="languageLink" :lang="chinese ? 'en' : 'zh-CN'">{{ chinese ? 'EN' : '中文' }}</a>
          <button class="top-button theme-button" :aria-label="chinese ? '切换主题' : 'Toggle theme'" @click="toggleTheme">{{ isDark ? '☼' : '☾' }}</button>
          <a class="top-button github-button" href="https://github.com/HayashiUme/Finesse" target="_blank" rel="noreferrer">GitHub <span>↗</span></a>
        </div>
      </header>

      <div v-if="frontmatter.layout === 'home'" class="home-wrap">
        <section class="home-hero">
          <div class="hero-copy">
            <div class="status-chip"><i></i>{{ chinese ? '服务器管理文档' : 'Server management docs' }}</div>
            <h1>{{ frontmatter.hero?.name || 'Finesse' }}</h1>
            <h2>{{ frontmatter.hero?.text }}</h2>
            <p>{{ frontmatter.hero?.tagline }}</p>
            <div class="hero-actions"><a class="primary-action" :href="withBase(localeRoot + 'installation')">{{ chinese ? '开始使用' : 'Get started' }} <span>→</span></a><a class="secondary-action" :href="withBase(localeRoot + 'guide')">{{ chinese ? '浏览使用指南' : 'Browse the guide' }}</a></div>
          </div>
          <div class="hero-art"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><img :src="withBase('/images/miku-acg-icon.png')" alt="Finesse" /><span class="art-spark spark-one">✦</span><span class="art-spark spark-two">✧</span><span class="art-dot"></span></div>
        </section>
        <section class="home-feature-grid">
          <a v-for="(feature, index) in frontmatter.features" :key="feature.title" class="feature-card" :href="withBase(localeRoot + ['installation','guide','extensions'][index])">
            <span class="feature-icon">{{ ['⌘', '◈', '✳'][index] }}</span><h3>{{ feature.title }}</h3><p>{{ feature.details }}</p><span class="feature-arrow">↗</span>
          </a>
        </section>
        <section class="home-content"><Content class="vp-doc" /></section>
      </div>

      <div v-else class="article-layout">
        <article class="article-card"><div class="article-kicker">{{ chinese ? 'FINESSE 文档' : 'FINESSE DOCUMENTATION' }}</div><Content class="vp-doc" /></article>
        <aside class="article-rail"><div class="rail-card"><span class="rail-icon">✦</span><h3>{{ chinese ? '快速开始' : 'Quick start' }}</h3><p>{{ chinese ? '准备好管理你的 Impostor 服务器了吗？' : 'Ready to manage your Impostor server?' }}</p><a :href="withBase(localeRoot + 'installation')">{{ chinese ? '查看安装指南' : 'Read installation guide' }} <span>→</span></a></div><div class="rail-note">{{ chinese ? 'Finesse · 服务器管理' : 'Finesse · Server management' }}</div></aside>
      </div>
      <footer class="docs-footer"><span>Finesse</span><span>{{ chinese ? '开源服务器管理平台' : 'Open source server management' }}</span><a href="https://github.com/HayashiUme/Finesse">GPL-3.0 · GitHub ↗</a></footer>
    </main>
  </div>
</template>
