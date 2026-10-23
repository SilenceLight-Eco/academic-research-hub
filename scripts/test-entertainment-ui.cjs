const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rules = require('../web/entertainment-rules.js');
const source = fs.readFileSync(path.join(__dirname, '../web/entertainment.js'), 'utf8');
function harness() {
  const events = {}, docEvents = {}, timers = new Map(); let timerId = 0;
  const root = { innerHTML: '', contains() { return false; }, querySelector() { return null; }, addEventListener(type, handler) { events[type] = handler; } };
  const document = { readyState: 'complete', hidden: false, activeElement: null, getElementById(id) { return id === 'entertainmentRoot' ? root : { classList: { contains() { return true; } } }; }, addEventListener(type, handler) { docEvents[type] = handler; } };
  const window = { AcademicGames: rules };
  vm.runInNewContext(source, { window, document, setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); }, console });
  function click(selector, dataset) { const node = { dataset, disabled: false }; events.click({ target: { closest(value) { return value === selector ? node : null; } } }); }
  return { root, timers, document, docEvents, window,
    tab(game) { click('[data-game-tab]', { gameTab: game }); },
    action(gameAction, extra = {}) { click('[data-game-action]', { gameAction, ...extra }); },
    card(id) { click('[data-card]', { card: String(id) }); },
    gomoku(at) { click('[data-gomoku-cell]', { gomokuCell: String(at) }); },
    chess(at) { click('[data-chess-cell]', { chessCell: String(at) }); },
    mode(value) { events.change({ target: { id: 'entertainmentMode', value } }); },
    run() { const first = timers.entries().next().value; if (first) { timers.delete(first[0]); first[1](); } }
  };
}
test('entertainment mounts once, exposes three games and does not duplicate event listeners', () => {
  const h = harness(); assert.match(h.root.innerHTML, /斗地主.*中国象棋.*五子棋/);
  const original = h.root.innerHTML; h.window.AcademicEntertainment.panelChanged('entertainment'); assert.equal(h.root.innerHTML, original);
  assert.equal(h.timers.size, 0);
});

test('card club preserves accessible game names and starts with collapsed optional details', () => {
  const h = harness();
  assert.match(h.root.innerHTML, /休闲棋牌室/);
  for (const name of ['斗地主', '中国象棋', '五子棋']) assert.ok(h.root.innerHTML.includes('role="tab" aria-label="' + name + '"'));
  assert.equal((h.root.innerHTML.match(/class="player-avatar"/g) || []).length, 3);
  assert.match(h.root.innerHTML, /<details class="landlord-log"><summary>本局出牌记录/);
  assert.match(h.root.innerHTML, /<details class="game-help"><summary>/);
  assert.doesNotMatch(h.root.innerHTML, /<img|https?:\/\//);
});

test('decorated overlapping hand preserves independent selection and shows the human trick', () => {
  const h = harness(); h.action('bid', { bid: '3' });
  const ids = [...h.root.innerHTML.matchAll(/data-card="(\d+)"/g)].map(match => Number(match[1]));
  assert.equal(ids.length, 20);
  h.card(ids[0]); h.card(ids[1]);
  assert.match(h.root.innerHTML, /已选择 2 张/);
  assert.equal((h.root.innerHTML.match(/aria-pressed="true"/g) || []).length, 2);
  h.card(ids[1]); h.action('play');
  assert.match(h.root.innerHTML, /class="landlord-my-play" aria-label="你最近出的牌"><button/);
  assert.equal((h.root.innerHTML.match(/data-card="/g) || []).length, 0);
  assert.equal(h.timers.size, 1);
});
test('landlord hint and play advance to the bots, leaving the panel cancels and re-entering resumes', () => {
  const h = harness(); h.action('bid', { bid: '3' }); assert.match(h.root.innerHTML, /地主（20 张）/);
  h.action('hint'); assert.match(h.root.innerHTML, /aria-pressed="true"/);
  h.action('play'); assert.equal(h.timers.size, 1); assert.match(h.root.innerHTML, /电脑 1出牌/);
  const paused = h.root.innerHTML;
  h.window.AcademicEntertainment.panelChanged('dashboard'); assert.equal(h.timers.size, 0); h.run(); assert.equal(h.root.innerHTML, paused);
  h.window.AcademicEntertainment.panelChanged('entertainment'); assert.equal(h.timers.size, 1); h.run(); h.run();
  assert.match(h.root.innerHTML, /你出牌/);
});
test('switching games and hiding the page cancel pending bot turns without clearing the board', () => {
  const h = harness(); h.tab('gomoku'); h.gomoku(112); assert.equal(h.timers.size, 1);
  h.document.hidden = true; h.docEvents.visibilitychange(); assert.equal(h.timers.size, 0);
  h.document.hidden = false; h.docEvents.visibilitychange(); assert.equal(h.timers.size, 1);
  h.tab('chess'); assert.equal(h.timers.size, 0);
  h.tab('gomoku'); assert.equal(h.timers.size, 1); assert.match(h.root.innerHTML, /gomoku-stone stone-1/);
  h.run(); assert.equal((h.root.innerHTML.match(/gomoku-stone stone-/g) || []).length, 2);
});
test('gomoku undo cancels an unplayed AI move and later undoes a complete human/AI round', () => {
  const h = harness(); h.tab('gomoku'); h.gomoku(112); h.action('undo');
  assert.equal(h.timers.size, 0); assert.doesNotMatch(h.root.innerHTML, /gomoku-stone stone-/);
  h.gomoku(112); h.run(); assert.equal((h.root.innerHTML.match(/gomoku-stone stone-/g) || []).length, 2);
  h.action('undo'); assert.doesNotMatch(h.root.innerHTML, /gomoku-stone stone-/); assert.match(h.root.innerHTML, /黑棋行棋/);
});
test('local gomoku alternates without AI, detects victory, and restart clears the result', () => {
  const h = harness(); h.tab('gomoku'); h.mode('local');
  [0, 15, 1, 16, 2, 17, 3, 18, 4].forEach(at => h.gomoku(at));
  assert.equal(h.timers.size, 0); assert.match(h.root.innerHTML, /黑棋获胜！/);
  h.action('restart'); assert.doesNotMatch(h.root.innerHTML, /黑棋获胜！|gomoku-stone stone-/);
});
test('xiangqi selected legal destinations, AI replies and round undo all preserve legal turns', () => {
  const h = harness(); h.tab('chess'); h.chess(54); assert.match(h.root.innerHTML, /chess-move-dot/);
  h.chess(45); assert.match(h.root.innerHTML, /黑方行棋/); assert.equal(h.timers.size, 1);
  h.run(); assert.match(h.root.innerHTML, /红方行棋/); assert.equal(h.timers.size, 0);
  h.action('undo'); assert.match(h.root.innerHTML, /第7行第1列，红方兵/); assert.match(h.root.innerHTML, /第6行第1列，空位/);
});
