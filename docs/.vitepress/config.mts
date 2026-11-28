import { defineConfig } from 'vitepress'

const enSidebar = [
  { text: 'Getting started', items: [
    { text: 'Installation', link: '/en/installation' },
    { text: 'User guide', link: '/en/guide' },
    { text: 'Management features', link: '/en/management' },
  ] },
  { text: 'Reference', items: [
    { text: 'HTTP API v1', link: '/en/api-v1' },
    { text: 'Public API v2', link: '/en/api-v2' },
    { text: 'Extensions', link: '/en/extensions' },
    { text: 'Dashboard updater', link: '/en/dashboard-updater' },
  ] },
  { text: 'Project', items: [
    { text: 'Privacy policy', link: '/en/privacy-policy' },
    { text: 'Docker troubleshooting', link: '/en/docker-troubleshooting' },
    { text: 'Interface language', link: '/en/interface-localization' },
  ] },
]

const zhSidebar = [
  { text: '开始使用', items: [
    { text: '安装与部署', link: '/zh-CN/installation' },
    { text: '使用指南', link: '/zh-CN/guide' },
    { text: '管理功能', link: '/zh-CN/management' },
  ] },
  { text: '接口与扩展', items: [
    { text: 'HTTP API v1', link: '/zh-CN/api-v1' },
    { text: '公开 API v2', link: '/zh-CN/api-v2' },
    { text: '扩展插件', link: '/zh-CN/extensions' },
    { text: '面板更新器', link: '/zh-CN/dashboard-updater' },
  ] },
  { text: '项目', items: [
    { text: '隐私政策', link: '/zh-CN/privacy-policy' },
    { text: 'Docker 连接排查', link: '/zh-CN/docker-troubleshooting' },
    { text: '界面语言', link: '/zh-CN/interface-localization' },
  ] },
]

export default defineConfig({
  lang: 'en-US',
  title: 'Finesse Docs',
  description: 'Documentation for the Finesse server management platform.',
  base: process.env.FINESSE_BASE_PATH || '/Finesse/',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#39c5bb' }],
    ['link', { rel: 'icon', type: 'image/png', href: '/Finesse/images/miku-acg-icon.png' }],
  ],
  locales: {
    root: { label: 'English', lang: 'en-US', link: '/en/' },
    'zh-CN': { label: '简体中文', lang: 'zh-CN', link: '/zh-CN/' },
  },
  themeConfig: {
    logo: '/images/miku-acg-icon.png',
    siteTitle: 'Finesse',
    socialLinks: [{ icon: 'github', link: 'https://github.com/HayashiUme/Finesse' }],
    footer: { message: 'Open source server management for Impostor.', copyright: 'Released under GPL-3.0.' },
    search: { provider: 'local' },
    nav: [
      { text: 'Documentation', link: '/en/installation' },
      { text: 'API', items: [{ text: 'HTTP API v1', link: '/en/api-v1' }, { text: 'Public API v2', link: '/en/api-v2' }] },
      { text: 'GitHub', link: 'https://github.com/HayashiUme/Finesse' },
    ],
    sidebar: { '/en/': enSidebar, '/zh-CN/': zhSidebar },
    locales: {
      root: { nav: [
        { text: 'Documentation', link: '/en/installation' },
        { text: 'API', items: [{ text: 'HTTP API v1', link: '/en/api-v1' }, { text: 'Public API v2', link: '/en/api-v2' }] },
        { text: 'GitHub', link: 'https://github.com/HayashiUme/Finesse' },
      ], sidebar: { '/en/': enSidebar } },
      'zh-CN': { footer: { message: 'Impostor 开源服务器管理平台。', copyright: '基于 GPL-3.0 许可证发布。' }, nav: [
        { text: '文档', link: '/zh-CN/installation' },
        { text: '接口', items: [{ text: 'HTTP API v1', link: '/zh-CN/api-v1' }, { text: '公开 API v2', link: '/zh-CN/api-v2' }] },
        { text: 'GitHub', link: 'https://github.com/HayashiUme/Finesse' },
      ], sidebar: { '/zh-CN/': zhSidebar } },
    },
  },
})
