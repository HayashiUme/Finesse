import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

let checks = 0
function check(name, run) { run(); checks++; console.log(`✓ ${name}`) }
function setup(initial = {}, failWrites = false, protocol = 'http:', href = `${protocol}//localhost:5173`, response = { ok: true, text: async () => '' }) {
  const values = new Map(Object.entries(initial))
  const calls = []
  class LocalizedError extends Error { constructor(key) { super(key); this.key = key } }
  const context = {
    window: { location: { protocol, href }, setTimeout, clearTimeout }, URL, AbortController, DOMException,
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (failWrites) throw Error('Storage full'); values.set(key, value) }, removeItem: key => values.delete(key) },
    fetch: async (url, options) => { calls.push({ url, options }); return response },
  }
  const modules = { './i18n': { LocalizedError } }
  for (const name of ['api', 'connections']) {
    const module = { exports: {} }
    const source = ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(source, { ...context, module, exports: module.exports, require: id => modules[id] })
    modules[`./${name}`] = module.exports
  }
  return { ...modules['./connections'], api: modules['./api'], values, calls }
}
const a = { name: 'Alpha', baseUrl: 'http://localhost:8097/', apiKey: 'alpha-test-key' }
const b = { name: 'Beta', baseUrl: 'http://localhost:8098', apiKey: 'beta-test-key' }
const empty = { version: 1, servers: [], activeServerId: null }
check('Migrate the previous connection once without persisting its API Key', () => {
  const state = setup({ 'finesse-connection': JSON.stringify(a) })
  const result = state.loadServerRegistry()
  assert.equal(result.servers.length, 1)
  assert.equal(result.servers[0].apiKey, undefined)
  assert.equal(result.activeServerId, result.servers[0].id)
  assert.ok(state.values.get('finesse-servers'))
  assert.ok(!state.values.get('finesse-servers').includes(a.apiKey))
  assert.ok(!state.values.has('finesse-connection'))
  assert.equal(state.loadServerRegistry().servers[0].id, result.servers[0].id)
})
check('An intentionally empty registry does not resurrect an old server', () => {
  const state = setup({ 'finesse-servers': JSON.stringify(empty), 'finesse-connection': JSON.stringify(a) })
  assert.equal(state.loadServerRegistry().servers.length, 0)
})
check('Storage failure preserves the legacy connection for recovery', () => {
  const state = setup({ 'finesse-connection': JSON.stringify(a) }, true)
  const registry = state.loadServerRegistry()
  assert.equal(registry.servers.length, 1)
  assert.ok(state.values.has('finesse-connection'))
  assert.throws(() => state.saveServerRegistry(registry), /errorStorage/)
})
check('Add and edit servers without replacing other addresses or keys', () => {
  const state = setup()
  let registry = state.upsertServer(state.upsertServer(empty, a), b)
  const [first, second] = registry.servers
  registry = state.upsertServer(registry, { ...a, name: 'Renamed', apiKey: 'rotated-test-key' }, first.id)
  assert.equal(registry.servers[0].id, first.id)
  assert.equal(registry.servers[1].apiKey, second.apiKey)
  assert.equal(registry.servers[1].baseUrl, second.baseUrl)
  assert.throws(() => state.upsertServer(registry, { ...a, baseUrl: 'http://LOCALHOST:8097' }), /errorDuplicateServer/)
  assert.throws(() => state.upsertServer(registry, a, 'missing'), /errorServerMissing/)
  state.saveServerRegistry({ ...registry, activeServerId: second.id })
  assert.equal(state.loadServerRegistry().activeServerId, second.id)
})
check('Removing the active or last profile keeps the registry consistent', () => {
  const state = setup()
  let registry = state.upsertServer(state.upsertServer(empty, a), b)
  const [first, second] = registry.servers
  registry.activeServerId = first.id
  registry = state.removeServer(registry, first.id)
  assert.equal(registry.activeServerId, second.id)
  assert.equal(registry.servers[0].apiKey, undefined)
  registry = state.removeServer(registry, second.id)
  assert.equal(registry.activeServerId, null)
  assert.equal(registry.servers.length, 0)
})
check('Damaged entries and duplicate IDs/addresses cannot corrupt valid profiles', () => {
  const state = setup({ 'finesse-servers': JSON.stringify({ version: 1, activeServerId: 'missing', servers: [null, { ...a, id: 'one' }, { ...b, id: 'one' }, { ...a, id: 'two' }, { ...b, id: 'three' }, { id: 'bad', name: 12 }] }) })
  const result = state.loadServerRegistry()
  assert.equal(result.servers.length, 2)
  assert.equal(result.activeServerId, 'one')
})
check('HTTPS access retains saved HTTP profiles so users can edit them', () => {
  const state = setup({ 'finesse-servers': JSON.stringify({ ...empty, servers: [{ ...a, id: 'one' }] }) }, false, 'https:')
  assert.equal(state.loadServerRegistry().servers.length, 1)
  assert.throws(() => state.api.normalizeConnection(a), /errorHttps/)
})
const routing = setup()
await routing.api.playerAction(a, 42, 'kick')
await routing.api.gameAction(b, 'ABCDEF', 'privacy', false)
check('Actions send each server only its own API Key and target', () => {
  assert.equal(routing.calls[0].url, `${a.baseUrl.replace(/\/+$/, '')}/api/v1/players/42/kick`)
  assert.equal(routing.calls[0].options.headers['X-Api-Key'], a.apiKey)
  assert.equal(routing.calls[1].url, `${b.baseUrl}/api/v1/games/ABCDEF/privacy`)
  assert.equal(routing.calls[1].options.headers['X-Api-Key'], b.apiKey)
  assert.equal(routing.calls[1].options.body, '{"isPublic":false}')
})
for (const call of routing.calls) {
  assert.equal(call.options.credentials, 'omit')
  assert.equal(call.options.cache, 'no-store')
  assert.equal(call.options.referrerPolicy, 'no-referrer')
}
for (const [page, apiUrl] of [
  ['http://localhost:5173', 'http://remote.example.test:8097'],
  ['http://dashboard.example.test', 'https://api.example.test'],
]) {
  const state = setup({}, false, 'http:', page)
  await assert.rejects(state.api.login({ name: 'Remote', baseUrl: apiUrl }, 'admin', { username: 'staff', password: 'test-password' }), /errorSecureTransport/)
  assert.equal(state.calls.length, 0)
}
check('Remote HTTP credentials are blocked before fetch, including an insecure dashboard host', () => {})
const secure = setup({}, false, 'https:', 'https://dashboard.example.test')
await secure.api.playerAction({ name: 'Remote', baseUrl: 'https://api.example.test', token: 'test-session' }, 7, 'kick')
check('HTTPS bearer requests omit cookies and loopback HTTP remains usable', () => {
  assert.equal(secure.calls[0].options.headers.Authorization, 'Bearer test-session')
  assert.equal(secure.calls[0].options.credentials, 'omit')
  assert.ok(routing.calls.length > 0)
})
for (const [status, detail, expected] of [
  [404, {}, 'errorLoginUnavailable'], [401, {}, 'errorLoginUnavailable'],
  [500, {}, 'errorHttp'], [401, { error: 'invalidCredentials' }, 'invalidCredentials'],
  [429, { error: 'lockedOut', retryAfterSeconds: 900 }, 'lockedOut'],
]) {
  const state = setup({}, false, 'http:', 'http://localhost:5173', { ok: false, status, json: async () => detail })
  await assert.rejects(state.api.login(a, 'superadmin', { apiKey: 'test-key' }), new RegExp(expected))
}
check('Login distinguishes unavailable APIs and server errors from invalid credentials', () => {})
console.log(`${checks} connection checks passed.`)
