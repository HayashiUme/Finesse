import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'
import { createInstance } from 'i18next'

async function loadLocale(name) {
  const source = await readFile(new URL(`../src/locales/${name}.ts`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
  const exports = {}
  vm.runInNewContext(outputText, { exports })
  return exports.default
}

const en = await loadLocale('en')
const zhCN = await loadLocale('zh-CN')
assert.deepEqual(Object.keys(zhCN).sort(), Object.keys(en).sort(), 'Languages must have the same keys')
const tokens = text => [...text.matchAll(/{{\s*([^},\s]+)(?:[^}]+)?}}/g)].map(match => match[1]).sort()
const tags = text => [...text.matchAll(/<\/?([a-z]+)\s*\/?>/g)].map(match => match[0]).sort()
for (const [key, value] of Object.entries(en)) {
  assert.ok(zhCN[key].trim(), `${key}: Chinese translation is empty`)
  assert.deepEqual(tokens(zhCN[key]), tokens(value), `${key}: interpolation parameters differ`)
  assert.deepEqual(tags(zhCN[key]), tags(value), `${key}: rich text components differ`)
}

const i18n = createInstance()
await i18n.init({ lng: 'en', fallbackLng: 'zh-CN', resources: { en: { translation: en }, 'zh-CN': { translation: zhCN } }, interpolation: { escapeValue: false } })
assert.equal(i18n.t('totalGames', { count: 1 }), '1 room in total')
assert.equal(i18n.t('totalGames', { count: 2 }), '2 rooms in total')
assert.equal(i18n.t('totalGames', { count: 1234 }), '1,234 rooms in total')
assert.equal(i18n.t('playerFooter', { count: 1 }), '1 player shown · Bans apply to the current room only')
assert.equal(i18n.t('roomTitle', { code: 'ABCDXY' }), 'Room ABCDXY')
await i18n.changeLanguage('zh-CN')
assert.equal(i18n.t('totalGames', { count: 1 }), '共 1 个房间')
assert.equal(i18n.t('totalGames', { count: 2 }), '共 2 个房间')
assert.equal(i18n.t('kickedPlayer', { name: '测试 <Player>' }), '已踢出 测试 <Player>')
assert.equal(i18n.t('uptimeDays', { days: 2, hours: 3 }), '2 天 3 小时')
await i18n.changeLanguage('fr')
assert.equal(i18n.t('navOverview'), zhCN.navOverview, 'Unsupported languages fall back to Chinese')
console.log(`i18n checks passed: ${Object.keys(en).length} keys, interpolation, rich text, plurals, formatting and fallback`)
