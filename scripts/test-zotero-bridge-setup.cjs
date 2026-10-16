const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '../web/workbench.html'), 'utf8');
const readme = fs.readFileSync(path.join(__dirname, '../zotero-bridge/README.md'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../zotero-bridge/manifest.json'), 'utf8'));
const start = app.indexOf('  function requestTrackerZoteroBridge(');
const end = app.indexOf('  function testTrackerZoteroConnection(', start);
function harness() {
  const timers = [], messages = [];
  const context = vm.createContext({ Date, Math, Promise, Error,
    trackerZoteroBridgeRequests: Object.create(null), trackerZoteroBridgeChannel: 'academic-workbench-zotero-bridge-v1',
    setTimeout: callback => { timers.push(callback); return timers.length; },
    window: { postMessage: (data, origin) => messages.push({ data, origin }) }, location: { origin: 'https://silencelight-eco.github.io' }
  });
  vm.runInContext(app.slice(start, end), context);
  return { context, timers, messages };
}
test('a timeout does not falsely prove the extension was removed or demand repeated reinstalls', async () => {
  const h = harness(); const pending = h.context.requestTrackerZoteroBridge('ping', {}, 5000);
  const result = pending.catch(error => error.message); h.timers[0]();
  assert.match(await result, /未收到 Zotero Bridge 响应/);
  assert.match(await result, /若已安装.*Chrome 用户/);
  assert.match(await result, /扩展列表中确实没有它/);
  assert.doesNotMatch(await result, /请先在 Chrome 加载 zotero-bridge 扩展/);
  assert.equal(Object.keys(h.context.trackerZoteroBridgeRequests).length, 0);
});
test('timeout does not retry an import that may already have reached Zotero', async () => {
  const h = harness(); const pending = h.context.requestTrackerZoteroBridge('import', { items: [{ title: 'Test' }] }, 20000);
  const result = pending.catch(() => null); h.timers[0](); await result;
  assert.equal(h.messages.length, 1); assert.equal(h.messages[0].data.type, 'import');
  assert.equal(h.messages[0].origin, 'https://silencelight-eco.github.io');
});
test('setup guidance distinguishes browser profiles, fixed installation folders and desktop startup', () => {
  assert.match(page, /首次安装时.*固定文件夹.*同一个 Chrome 用户/);
  assert.match(page, /扩展仍在时无需重装.*先启动 Zotero/);
  assert.match(readme, /--profile-directory="Default"/);
  assert.match(readme, /不会自动出现在另一个用户中/);
  assert.match(readme, /不能代替一次实际的重启验证/);
});
test('repair does not expand extension permissions or introduce startup policy workarounds', () => {
  assert.deepEqual(manifest.permissions, []);
  assert.deepEqual(manifest.host_permissions, ['http://localhost:23119/*', 'http://127.0.0.1:23119/*']);
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://silencelight-eco.github.io/academic-research-hub/*']);
});
