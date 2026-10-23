const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rules = { ...require('../web/entertainment-rules.js'), ...require('../web/entertainment-extra.js') };
const source = fs.readFileSync(path.join(__dirname, '../web/entertainment.js'), 'utf8');
function harness(mahjongGame) {
  const events = {}, docEvents = {}, timers = new Map(); let timerId = 0;
  const root = { innerHTML: '', contains() { return false; }, querySelector() { return null; }, addEventListener(type, handler) { events[type] = handler; } };
  const document = { readyState: 'complete', hidden: false, activeElement: null, getElementById(id) { return id === 'entertainmentRoot' ? root : { classList: { contains() { return true; } } }; }, addEventListener(type, handler) { docEvents[type] = handler; } };
  const window = { AcademicGames: mahjongGame ? { ...rules, mahjong: { ...rules.mahjong, create() { return structuredClone(mahjongGame); } } } : rules };
  vm.runInNewContext(source, { window, document, setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); }, console });
  function click(selector, dataset) { const node = { dataset, disabled: false }; events.click({ target: { closest(value) { return value === selector ? node : null; } } }); }
  return { root, timers, document, docEvents, window,
    tab(game) { click('[data-game-tab]', { gameTab: game }); },
    action(gameAction, extra = {}) { click('[data-game-action]', { gameAction, ...extra }); },
    card(id) { click('[data-card]', { card: String(id) }); },
    gomoku(at) { click('[data-gomoku-cell]', { gomokuCell: String(at) }); },
    chess(at) { click('[data-chess-cell]', { chessCell: String(at) }); },
    reversi(at) { click('[data-reversi-cell]', { reversiCell: String(at) }); },
    tile(index) { click('[data-mahjong-tile]', { mahjongTile: String(index) }); },
    difficulty(value) { events.change({ target: { id: 'entertainmentDifficulty', value } }); },
    mode(value) { events.change({ target: { id: 'entertainmentMode', value } }); },
    run() { const first = timers.entries().next().value; if (first) { timers.delete(first[0]); first[1](); } }
  };
}
test('entertainment mounts once, exposes five games and does not duplicate event listeners', () => {
  const h = harness(); assert.match(h.root.innerHTML, /斗地主.*休闲麻将.*中国象棋.*五子棋.*黑白棋/);
  const original = h.root.innerHTML; h.window.AcademicEntertainment.panelChanged('entertainment'); assert.equal(h.root.innerHTML, original);
  assert.equal(h.timers.size, 0);
});

test('card club preserves accessible game names and starts with collapsed optional details', () => {
  const h = harness();
  assert.match(h.root.innerHTML, /休闲棋牌室/);
  for (const name of ['斗地主', '休闲麻将', '中国象棋', '五子棋', '黑白棋']) assert.ok(h.root.innerHTML.includes('role="tab" aria-label="' + name + '"'));
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

test('mahjong selects one tile, hint chooses a discard, bots pause on module or game switch', () => {
  const h = harness(); h.tab('mahjong');
  assert.equal((h.root.innerHTML.match(/data-mahjong-tile=/g) || []).length, 14);
  h.tile(0); assert.equal((h.root.innerHTML.match(/aria-pressed="true"/g) || []).length, 1);
  h.tile(1); assert.equal((h.root.innerHTML.match(/aria-pressed="true"/g) || []).length, 1);
  h.action('mahjong-hint'); assert.match(h.root.innerHTML, /已选择建议弃牌/);
  h.action('mahjong-discard'); assert.equal(h.timers.size, 1);
  const paused = h.root.innerHTML; h.window.AcademicEntertainment.panelChanged('dashboard');
  h.run(); assert.equal(h.root.innerHTML, paused); assert.equal(h.timers.size, 0);
  h.window.AcademicEntertainment.panelChanged('entertainment'); assert.equal(h.timers.size, 1);
  h.tab('gomoku'); assert.equal(h.timers.size, 0); h.tab('mahjong'); assert.equal(h.timers.size, 1);
  for (let i = 0; i < 30 && h.timers.size; i++) h.run();
  assert.equal(h.timers.size, 0); assert.doesNotMatch(h.root.innerHTML, /本局电脑走子遇到问题/);
});
test('mahjong exposes legal human claim actions and displays a winning result', () => {
  const g = rules.mahjong.create(); g.hands = [[0,1,2,3,4,5,9,10,11,18,18,18,26], [26,26], [5], [26]];
  g.turn = 3; rules.mahjong.discard(g, 3, 26); assert.equal(g.turn, 0);
  const h = harness(g); h.tab('mahjong'); assert.match(h.root.innerHTML, /data-claim="win"/); assert.match(h.root.innerHTML, /data-claim="pass"/);
  assert.equal((h.root.innerHTML.match(/data-mahjong-tile=/g) || []).length, 0);
  h.action('mahjong-claim', { claim: 'win' }); assert.match(h.root.innerHTML, /你胡牌了！/); assert.equal(h.timers.size, 0);
});
test('mahjong skip draws into the next turn and a legal concealed kong redraws a replacement', () => {
  let g = rules.mahjong.create(); g.hands = [[0,0,0,1,2,3,9,10,11,18,19,20,26], [5], [8], [0]]; g.turn = 3;
  rules.mahjong.discard(g, 3, 0); const h = harness(g); h.tab('mahjong'); assert.match(h.root.innerHTML, /data-claim="kong"/);
  h.action('mahjong-claim', { claim: 'pass' }); assert.match(h.root.innerHTML, /data-mahjong-tile=/); assert.equal(h.timers.size, 0);
  g = rules.mahjong.create(); g.hands[0] = [0,0,0,0,3,4,5,9,10,11,18,19,20,26];
  const kong = harness(g); kong.tab('mahjong'); assert.match(kong.root.innerHTML, /暗杠一万/);
  kong.action('mahjong-kong', { tile: '0' }); assert.match(kong.root.innerHTML, /aria-label="暗杠一万"/);
  assert.equal((kong.root.innerHTML.match(/data-mahjong-tile=/g) || []).length, 11);
});
test('reversi renders legal destinations, replies and undoes a whole round', () => {
  const h = harness(); h.tab('reversi'); assert.match(h.root.innerHTML, /八路黑白棋棋盘/);
  assert.equal((h.root.innerHTML.match(/reversi-move-dot/g) || []).length, 4);
  h.reversi(19); assert.equal(h.timers.size, 1); h.run(); assert.equal(h.timers.size, 0);
  assert.equal((h.root.innerHTML.match(/gomoku-stone stone-/g) || []).length, 6);
  h.action('undo'); assert.equal((h.root.innerHTML.match(/gomoku-stone stone-/g) || []).length, 4);
  h.mode('local'); h.reversi(19); assert.equal(h.timers.size, 0); assert.match(h.root.innerHTML, /白棋行棋/);
});
test('board difficulty applies on the next AI turn without resetting moves', () => {
  for (const game of ['gomoku','chess','reversi']) {
    const h = harness(); h.tab(game); h.difficulty('easy'); assert.match(h.root.innerHTML, /value="easy" selected/);
    if (game === 'gomoku') h.gomoku(112);
    else if (game === 'reversi') h.reversi(19);
    else { h.chess(54); h.chess(45); }
    assert.equal(h.timers.size, 1); h.difficulty('normal'); assert.equal(h.timers.size, 1);
    h.difficulty('easy'); h.run(); assert.doesNotMatch(h.root.innerHTML, /本局电脑走子遇到问题/); assert.equal(h.timers.size, 0);
    h.action('undo'); assert.equal(h.timers.size, 0);
  }
});

test('mahjong opponent concealed kongs hide tile identity and bot claims do not display a game-over action', () => {
  const g = rules.mahjong.create(); g.hands = [[5], [0,0,0], [8], [0]]; g.turn = 3;
  rules.mahjong.discard(g, 3, 0); g.melds[2] = [{ tile: 22, count: 4, concealed: true }];
  const h = harness(g); h.tab('mahjong');
  assert.match(h.root.innerHTML, /aria-label="暗杠（牌面隐藏）"/);
  assert.doesNotMatch(h.root.innerHTML, /aria-label="暗杠五条"|再来一局/);
  assert.equal(h.timers.size, 1);
});
