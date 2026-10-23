const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const games = require('../web/entertainment-rules.js');
const { gomoku: go, chess, landlord: ddz } = games;
const ids = ranks => ranks.flatMap(([rank, count]) => Array.from({ length: count }, (_, i) => rank === 16 ? 52 : rank === 17 ? 53 : (rank - 3) * 4 + i));
function board(pieces) { const b = Array(90).fill(null); for (const [at, piece] of pieces) b[at] = piece; return b; }
function rng(seed) { return () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296); }

test('gomoku rejects occupied and out-of-board cells without changing its input', () => {
  const b = Array(225).fill(0); b[0] = 1;
  for (const at of [-1, 225, 1.5, 0]) assert.equal(go.move(b, at, 2), null);
  assert.equal(go.move(b, 1, 3), null); assert.equal(b[1], 0);
});
test('gomoku detects all four directions and never wraps across board edges', () => {
  for (const step of [1, 15, 16, 14]) {
    const b = Array(225).fill(0), start = step === 14 ? 12 : 0;
    for (let i = 0; i < 4; i++) b[start + i * step] = 1;
    assert.equal(go.move(b, start + 4 * step, 1).winner, 1);
  }
  const b = Array(225).fill(0); [13, 14, 15, 16].forEach(at => { b[at] = 1; });
  assert.equal(go.move(b, 17, 1).winner, null);
});
test('gomoku AI wins immediately, blocks an immediate loss and starts at the center', () => {
  assert.equal(go.ai(Array(225).fill(0), 2), 112);
  let b = Array(225).fill(0); [0, 1, 2, 3].forEach(at => { b[at] = 1; }); assert.equal(go.ai(b, 2), 4);
  b = Array(225).fill(0); [0, 1, 2, 3].forEach(at => { b[at] = 2; }); assert.equal(go.ai(b, 2), 4);
});
test('xiangqi starts with 32 pieces and red can make only legal moves', () => {
  const b = chess.initial(); assert.equal(b.filter(Boolean).length, 32);
  assert.equal(chess.check(b, 'r'), false); assert.equal(chess.check(b, 'b'), false);
  assert.equal(chess.legal(b, 54, 45, 'r'), true);
  assert.equal(chess.legal(b, 54, 55, 'r'), false);
  assert.equal(chess.legal(b, 81, 0, 'r'), false);
  assert.equal(chess.legal(b, 0, 9, 'r'), false);
});
test('xiangqi enforces horse legs, elephant eyes, river and palace boundaries', () => {
  let b = board([[85, 'rK'], [4, 'bK'], [40, 'rP'], [64, 'rH'], [55, 'rP']]);
  assert.equal(chess.pseudo(b, 64, 47), false); b[55] = null; assert.equal(chess.pseudo(b, 64, 47), true);
  b = board([[85, 'rK'], [4, 'bK'], [40, 'rP'], [65, 'rE'], [57, 'rP']]);
  assert.equal(chess.pseudo(b, 65, 49), false); b[57] = null; assert.equal(chess.pseudo(b, 65, 49), true);
  b[49] = 'rE'; assert.equal(chess.pseudo(b, 49, 33), false);
  b[84] = 'rA'; assert.equal(chess.pseudo(b, 84, 74), false); assert.equal(chess.pseudo(b, 84, 76), true);
});
test('xiangqi cannons need exactly one screen to capture and pawns cannot retreat', () => {
  const b = board([[85, 'rK'], [4, 'bK'], [40, 'rP'], [63, 'rC'], [36, 'bR']]);
  assert.equal(chess.pseudo(b, 63, 36), false); b[54] = 'rP'; assert.equal(chess.pseudo(b, 63, 36), true);
  b[45] = 'rP'; assert.equal(chess.pseudo(b, 63, 36), false);
  assert.equal(chess.pseudo(b, 40, 41), true); assert.equal(chess.pseudo(b, 40, 49), false);
});
test('xiangqi prevents exposing facing generals and detects checks', () => {
  const b = board([[85, 'rK'], [4, 'bK'], [40, 'rR']]);
  assert.equal(chess.legal(b, 40, 41, 'r'), false);
  assert.equal(chess.legal(b, 40, 31, 'r'), true);
  b[40] = null; assert.equal(chess.check(b, 'r'), true);
  assert.equal(chess.pseudo(b, 85, 4), true);
});
test('xiangqi AI returns a legal move without mutating the board', () => {
  const b = chess.initial(), before = JSON.stringify(b), move = chess.ai(b, 'b');
  assert.ok(move); assert.equal(chess.legal(b, move.from, move.to, 'b'), true); assert.equal(JSON.stringify(b), before);
});
test('xiangqi distinguishes checkmate and stalemate but both have no legal moves', () => {
  const mate = board([[4, 'bK'], [85, 'rK'], [12, 'rR'], [13, 'rR'], [14, 'rR']]);
  assert.equal(chess.check(mate, 'b'), true); assert.equal(chess.moves(mate, 'b').length, 0);
  const stale = board([[4, 'bK'], [85, 'rK'], [12, 'rR'], [14, 'rR'], [40, 'rP']]);
  assert.equal(chess.check(stale, 'b'), false); assert.equal(chess.moves(stale, 'b').length, 0);
});
test('dou dizhu deals 54 distinct cards and gives only the landlord the reserve', () => {
  const g = ddz.create(rng(1)); assert.deepEqual(g.hands.map(h => h.length), [17, 17, 17]);
  assert.equal(new Set(g.hands.flat().concat(g.reserve)).size, 54);
  assert.equal(ddz.bid(g, 1, 3), false); assert.equal(ddz.bid(g, 0, 3), true);
  assert.equal(g.phase, 'play'); assert.equal(g.landlord, 0); assert.equal(g.turn, 0); assert.equal(g.hands[0].length, 20);
});
test('bidding rejects stale lower bids and all passes require a redeal', () => {
  const g = ddz.create(rng(2)); ddz.bid(g, 0, 1);
  assert.equal(ddz.bid(g, 1, 1), false); ddz.bid(g, 1, 2); ddz.bid(g, 2, 0); assert.equal(g.landlord, 1); assert.equal(g.phase, 'play');
  const h = ddz.create(rng(3)); [0, 1, 2].forEach(seat => ddz.bid(h, seat, 0)); assert.equal(h.phase, 'redeal');
});
test('dou dizhu recognizes standard singles, triples, straights, bombs and attachments', () => {
  const cases = [
    [[[3, 1]], 'single'], [[[3, 2]], 'pair'], [[[3, 3]], 'triple'], [[[3, 4]], 'bomb'], [[[16, 1], [17, 1]], 'rocket'],
    [[[3, 3], [4, 1]], 'triple-single'], [[[3, 3], [4, 2]], 'triple-pair'],
    [[[3, 1], [4, 1], [5, 1], [6, 1], [7, 1]], 'straight'],
    [[[3, 2], [4, 2], [5, 2]], 'pair-run'], [[[3, 3], [4, 3]], 'airplane'],
    [[[3, 3], [4, 3], [6, 1], [8, 1]], 'airplane-single'],
    [[[3, 3], [4, 3], [6, 2], [8, 2]], 'airplane-pair'],
    [[[3, 4], [6, 2]], 'four-single'], [[[3, 4], [6, 2], [8, 2]], 'four-pair']
  ];
  cases.forEach(([ranks, type]) => assert.equal(ddz.pattern(ids(ranks))?.type, type, type));
});
test('invalid patterns, duplicate cards, short straights and 2 in sequences are rejected', () => {
  for (const cards of [[], [0, 0], [54], ids([[3, 1], [4, 1]]), ids([[11, 1], [12, 1], [13, 1], [14, 1], [15, 1]])]) assert.equal(ddz.pattern(cards), null);
});
test('bombs and rockets compare correctly and ordinary plays need equal shapes and lengths', () => {
  const p = ranks => ddz.pattern(ids(ranks));
  assert.equal(ddz.beats(p([[4, 2]]), p([[3, 2]])), true);
  assert.equal(ddz.beats(p([[4, 1]]), p([[3, 2]])), false);
  assert.equal(ddz.beats(p([[3, 4]]), p([[15, 3]])), true);
  assert.equal(ddz.beats(p([[3, 4]]), p([[4, 4]])), false);
  assert.equal(ddz.beats(p([[16, 1], [17, 1]]), p([[15, 4]])), true);
});
test('passing twice clears the old trick and returns the lead; wrong turns and cards are rejected', () => {
  const g = ddz.create(rng(4)); ddz.bid(g, 0, 3);
  assert.equal(ddz.play(g, 0, []), false); assert.equal(ddz.play(g, 1, [g.hands[1][0]]), false);
  const card = g.hands[0][0]; assert.equal(ddz.play(g, 0, [card]), true);
  ddz.play(g, 1, []); ddz.play(g, 2, []); assert.equal(g.last, null); assert.equal(g.turn, 0);
  assert.equal(ddz.play(g, 0, [card]), false);
});
test('bot candidates are legal owned subsets and complete games terminate without invalid or skipped turns', () => {
  for (let seed = 1; seed <= 15; seed++) {
    const g = ddz.create(rng(seed)); ddz.bid(g, 0, 3);
    let steps = 0;
    while (g.phase === 'play' && steps++ < 450) {
      const seat = g.turn, cards = ddz.ai(g, seat);
      assert.ok(ddz.play(g, seat, cards), 'valid bot play at seed ' + seed);
      assert.equal(new Set(g.hands.flat()).size, g.hands.flat().length);
    }
    assert.equal(g.phase, 'over', 'game terminates at seed ' + seed);
    assert.equal(g.hands[g.winner].length, 0);
  }
});
test('entertainment is isolated from cloud APIs and every board is mounted once', () => {
  const js = fs.readFileSync(path.join(__dirname, '../web/entertainment.js'), 'utf8');
  assert.doesNotMatch(js, /fetch\(|localStorage|supabase|\/api\//);
  const html = fs.readFileSync(path.join(__dirname, '../web/workbench.html'), 'utf8');
  assert.equal((html.match(/id="entertainmentRoot"/g) || []).length, 1);
  assert.match(html, /data-panel="entertainment"/);
  assert.ok(html.indexOf('entertainment-rules.js') < html.indexOf('src="entertainment.js'));
  const app = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
  assert.match(app, /entertainment: '娱乐'/); assert.match(app, /AcademicEntertainment\.panelChanged\(panel\)/);
  new vm.Script(js);
});
