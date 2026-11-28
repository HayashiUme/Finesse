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
const sidebar = computed(() => site.value.themeConfig.sidebar?.[localeRoot.value] ?? [])
const currentLink = computed(() => '/' + page.value.relativePath
  .replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, ''))
const activeTitle = computed(() => frontmatter.value.title || page.value.title || (chinese.value ? '文档' : 'Documentation'))
const visibleGroups = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle) return sidebar.value
  return sidebar.value.map(group => ({ ...group, items: group.items.filter(item => item.text.toLocaleLowerCase().includes(needle)) })).filter(group => group.items.length)
})
function switchLanguage(target: string) {
  const targetPrefix = target === 'zh-CN' ? '/zh-CN/' : '/en/'
  const counterpart = targetPrefix + (currentLink.value.startsWith(localeRoot.value)
    ? currentLink.value.slice(localeRoot.value.length)
    : '')
  const destination = documents.some(({ link }) => link === counterpart) ? counterpart : targetPrefix
  window.location.href = withBase(destination)
}
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
    </aside>

    <main class="docs-main">
      <header class="docs-topbar">
        <button class="mobile-menu" :aria-label="chinese ? '打开导航' : 'Open navigation'" @click="mobileOpen = true">☰</button>
        <div class="breadcrumbs"><a :href="withBase(localeRoot)">Finesse</a><span>/</span><strong>{{ activeTitle }}</strong></div>
        <div class="top-actions">
          <label class="language-switcher">
            <span class="sr-only">{{ chinese ? '切换语言' : 'Change language' }}</span>
            <select :value="locale" :aria-label="chinese ? '切换语言' : 'Change language'" @change="switchLanguage(($event.target as HTMLSelectElement).value)">
              <option value="en">English</option>
              <option value="zh-CN">简体中文</option>
            </select>
          </label>
          <button class="top-button theme-button" :aria-label="chinese ? '切换主题' : 'Toggle theme'" @click="toggleTheme">{{ isDark ? '☼' : '☾' }}</button>
        </div>
      </header>

      <div v-if="frontmatter.layout === 'home'" class="home-wrap">
        <section class="home-hero">
          <div class="hero-copy">
            <div class="status-chip"><i></i>{{ chinese ? '服务器管理文档' : 'Server management docs' }}</div>
            <h1>{{ frontmatter.hero?.name || 'Finesse' }}</h1>
            <h2>{{ frontmatter.hero?.text }}</h2>
            <p>{{ frontmatter.hero?.tagline }}</p>
            <div class="hero-actions"><a class="primary-action" :href="withBase(localeRoot + 'installation')">{{ chinese ? '开始使用' : 'Get started' }} <span>→</span></a><a class="secondary-action" :href="withBase(localeRoot + 'extensions')">{{ chinese ? '浏览插件开发文档' : 'Explore extension development' }}</a></div>
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
        <article class="article-card"><Content class="vp-doc" /></article>
      </div>
    </main>
  </div>
</template>
