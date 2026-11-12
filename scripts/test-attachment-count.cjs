const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../web/static-api.js'), 'utf8');
const start = source.indexOf('    count: async function', source.indexOf('window.__academicAttachments ='));
const end = source.indexOf('\n    list:', start);

function harness(result, signedOut = false) {
  const calls = [];
  const builder = {
    select(...args) { calls.push(['select', ...args]); return builder; },
    eq(...args) { calls.push(['eq', ...args]); return builder; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
  };
  const context = vm.createContext({
    client: { from(table) { calls.push(['from', table]); return builder; } },
    attachmentContext(kind, id) { if (kind !== 'paper' || !/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error('Invalid context'); return { kind, id }; },
    async attachmentSession() { if (signedOut) throw new Error('Signed out'); return { user: { id: 'own-user' } }; }
  });
  vm.runInContext('var attachments = ({' + source.slice(start, end) + '});', context);
  return { count: context.attachments.count, calls };
}

test('attachment counts use exact HEAD counts filtered to the authenticated account and material context', async () => {
  const h = harness({ count: 321, error: null });
  assert.equal(await h.count('paper', 'peer_review_123_r4_response'), 321);
  assert.equal(h.calls[0][1], 'research_attachments');
  assert.equal(h.calls[1][1], 'id'); assert.equal(h.calls[1][2].count, 'exact'); assert.equal(h.calls[1][2].head, true);
  assert.deepEqual(h.calls.slice(2), [['eq', 'user_id', 'own-user'], ['eq', 'context_kind', 'paper'], ['eq', 'context_id', 'peer_review_123_r4_response']]);
  assert.equal(await harness({ count: 0 }).count('paper', 'peer_review_123_r1_manuscript'), 0);
});

test('auth errors, database errors and unconfirmed counts are never converted into zero files', async () => {
  const signedOut = harness({ count: 0 }, true);
  await assert.rejects(signedOut.count('paper', 'valid'), /Signed out/); assert.equal(signedOut.calls.length, 0);
  const invalid = harness({ count: 0 }); await assert.rejects(invalid.count('paper', '../bad'), /Invalid/); assert.equal(invalid.calls.length, 0);
  await assert.rejects(harness({ error: new Error('Permission denied') }).count('paper', 'valid'), /Permission denied/);
  for (const count of [null, undefined, -1, 1.2]) await assert.rejects(harness({ count }).count('paper', 'valid'), /无法确认/);
});
