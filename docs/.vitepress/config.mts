import { defineConfig } from 'vitepress'

const enSidebar = [
  { text: 'Core documentation', items: [
    { text: 'Installation', link: '/en/installation' },
    { text: 'API v1', link: '/en/api-v1' },
    { text: 'API v2', link: '/en/api-v2' },
    { text: 'X-API', link: '/en/x-api' },
    { text: 'Troubleshooting', link: '/en/docker-troubleshooting' },
    { text: 'Privacy policy', link: '/en/privacy-policy' },
  ] },
  { text: 'Extension development', items: [
    { text: 'Complete development guide', link: '/en/extensions' },
  ] },
]

const zhSidebar = [
  { text: '核心文档', items: [
    { text: '安装与部署', link: '/zh-CN/installation' },
    { text: 'API v1', link: '/zh-CN/api-v1' },
    { text: 'API v2', link: '/zh-CN/api-v2' },
    { text: 'X-API', link: '/zh-CN/x-api' },
    { text: '故障排查', link: '/zh-CN/docker-troubleshooting' },
    { text: '隐私政策', link: '/zh-CN/privacy-policy' },
  ] },
  { text: '插件开发', items: [
    { text: '完整开发文档', link: '/zh-CN/extensions' },
  ] },
]

const base = process.env.FINESSE_BASE_PATH || '/'

export default defineConfig({
  lang: 'en-US',
  title: 'Finesse Docs',
  description: 'Documentation for the Finesse server management platform.',
  base,
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#39c5bb' }],
    ['link', { rel: 'icon', type: 'image/png', href: `${base}images/miku-acg-icon.png` }],
  ],
  locales: {
    root: { label: 'English', lang: 'en-US', link: '/en/' },
    'zh-CN': { label: '简体中文', lang: 'zh-CN', link: '/zh-CN/' },
  },
  themeConfig: {
    logo: '/images/miku-acg-icon.png',
    siteTitle: 'Finesse',
    search: { provider: 'local' },
    nav: [
      { text: 'Documentation', link: '/en/installation' },
    ],
    sidebar: { '/en/': enSidebar, '/zh-CN/': zhSidebar },
    locales: {
      root: { nav: [
        { text: 'Documentation', link: '/en/installation' },
      ], sidebar: { '/en/': enSidebar } },
      'zh-CN': { nav: [
        { text: '文档', link: '/zh-CN/installation' },
        { text: '接口', link: '/zh-CN/api-v2' },
      ], sidebar: { '/zh-CN/': zhSidebar } },
    },
  },
})
