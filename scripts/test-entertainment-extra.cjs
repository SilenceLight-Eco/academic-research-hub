const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { mahjong: mj, reversi: rv } = require('../web/entertainment-extra.js');
function rng(seed) { return () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296); }
function fixture(hands) { const g = mj.create(rng(3)); g.hands = hands; g.melds = [[],[],[],[]]; g.discards = [[],[],[],[]]; g.wall = [20,21,22,23]; g.turn = 0; g.phase = 'discard'; g.lastDraw = hands[0].at(-1); return g; }
function inventory(g) {
  const all = g.wall.concat(...g.hands, ...g.discards, ...g.melds.flatMap(melds => melds.map(m => Array(m.count).fill(m.tile))));
  assert.equal(all.length, 108);
  for (let tile = 0; tile < 27; tile++) assert.equal(all.filter(t => t === tile).length, 4, `tile ${tile}`);
}
test('browser bundle extends the original game registry without replacing it', () => {
  const window = { AcademicGames: { existing: true } }; const context = { globalThis: window };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/entertainment-extra.js'), 'utf8'), context);
  assert.equal(window.AcademicGames.existing, true); assert.equal(typeof window.AcademicGames.mahjong.create, 'function');
  const html = fs.readFileSync(path.join(__dirname, '../web/workbench.html'), 'utf8');
  assert.ok(html.indexOf('entertainment-rules.js') < html.indexOf('entertainment-extra.js'));
  assert.ok(html.indexOf('entertainment-extra.js') < html.indexOf('entertainment.js?'));
});
test('mahjong deals a complete 108-tile wall with a 14-tile dealer and three 13-tile hands', () => {
  const g = mj.create(rng(4)); inventory(g); assert.deepEqual(g.hands.map(h => h.length), [14,13,13,13]); assert.equal(g.wall.length, 55);
  assert.equal(g.turn, 0); assert.equal(g.phase, 'discard'); assert.equal(mj.label(0), '一万'); assert.equal(mj.label(26), '九条');
});
test('mahjong accepts standard hands, open melds, seven pairs and quad-as-two-pairs', () => {
  assert.equal(mj.winning([0,1,2,3,4,5,9,10,11,18,18,18,26,26]), true);
  assert.equal(mj.winning([0,1,2,9,10,11,18,18,18,26,26], 1), true);
  assert.equal(mj.winning([0,0,1,1,3,3,9,9,12,12,18,18,25,25]), true);
  assert.equal(mj.winning([0,0,0,0,3,3,9,9,12,12,18,18,25,25]), true);
  assert.equal(mj.winning([2,2], 4), true);
});
test('mahjong rejects cross-suit sequences, invalid counts, invalid tiles and incomplete hands', () => {
  assert.equal(mj.winning([7,8,9,3,4,5,12,13,14,18,18,18,26,26]), false);
  for (const hand of [[0,0,0,0,0,1,2,3,4,5,6,7,8,8], [0,1], Array(14).fill(27)]) assert.equal(mj.winning(hand), false);
  assert.equal(mj.winning([0,0,1,1,3,3,9,9,12,12,18,18,25,25], 1), false);
});
test('mahjong rejects wrong turn and absent tile without mutation', () => {
  const g = mj.create(rng(4)), before = JSON.stringify(g);
  assert.equal(mj.discard(g, 1, g.hands[1][0]), false); assert.equal(mj.discard(g, 0, 99), false);
  assert.equal(mj.claim(g, 0, 'pung'), false); assert.equal(mj.kong(g, 0, 99), false); assert.equal(JSON.stringify(g), before);
});
test('mahjong wins have priority over a nearer pung, and claimed tiles are not duplicated', () => {
  const g = fixture([[26], [26,26,0], [0,1,2,3,4,5,9,10,11,18,18,18,26], [1]]);
  mj.discard(g, 0, 26); assert.equal(g.turn, 2); assert.deepEqual(g.pending.actions, ['win']);
  assert.equal(mj.claim(g, 2, 'win'), true); assert.equal(g.winner, 2); assert.equal(g.discards[0].length, 0); assert.equal(g.hands[2].length, 14);
});
test('mahjong can decline a win, pung, and must discard without drawing or claiming self-draw', () => {
  const g = fixture([[26], [26,26,0], [0,1,2,3,4,5,9,10,11,18,18,18,26], [1]]);
  mj.discard(g, 0, 26); mj.claim(g, 2, 'pass'); assert.equal(g.turn, 1);
  mj.claim(g, 1, 'pung'); assert.deepEqual(g.melds[1], [{tile:26,count:3,concealed:false}]);
  assert.equal(g.hands[1].length, 1); assert.equal(g.wall.length, 4); assert.equal(g.phase, 'discard'); assert.equal(mj.options(g, 1).win, false);
});
test('mahjong exposed and concealed kongs remove correct tiles and draw exactly one replacement', () => {
  let g = fixture([[0], [0,0,0,9], [2], [5]]); mj.discard(g, 0, 0); mj.claim(g, 1, 'kong');
  assert.equal(g.melds[1][0].count, 4); assert.equal(g.hands[1].length, 2); assert.equal(g.wall.length, 3); assert.equal(g.lastDraw, 23);
  g = fixture([[0,0,0,0,9], [2], [5], [8]]); assert.equal(mj.kong(g, 0, 0), true);
  assert.equal(g.hands[0].length, 2); assert.equal(g.melds[0][0].concealed, true); assert.equal(g.wall.length, 3);
  g.wall = []; g.hands[0] = [1,1,1,1]; assert.equal(mj.kong(g, 0, 1), false);
});
test('mahjong self draw wins and an empty wall ends in a draw', () => {
  let g = fixture([[0,1,2,3,4,5,9,10,11,18,18,18,26,26], [1], [4], [7]]);
  assert.equal(mj.win(g, 0), true); assert.equal(g.result.type, 'self'); assert.equal(g.phase, 'over');
  g = fixture([[0], [2], [5], [8]]); g.wall = []; mj.discard(g, 0, 0); assert.equal(g.winner, 'draw'); assert.equal(g.phase, 'over');
});
test('60 deterministic full mahjong games terminate and conserve every copy of every tile', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = mj.create(rng(seed)); let steps = 0;
    while (g.phase !== 'over' && steps++ < 500) { inventory(g); assert.equal(mj.ai(g), true); }
    assert.equal(g.phase, 'over', `seed ${seed} stalled`); inventory(g);
    if (g.winner !== 'draw') assert.equal(mj.winning(g.hands[g.winner], g.melds[g.winner].length), true);
  }
});
test('reversi initial legal moves flip a stone without mutating the input', () => {
  const b = rv.initial(); assert.deepEqual(rv.moves(b, 1), [19,26,37,44]);
  const result = rv.move(b, 19, 1); assert.equal(result.captured, 1); assert.equal(result.board[27], 1); assert.equal(b[27], 2); assert.equal(result.turn, 2);
  for (const at of [-1,64,27,0,1.1]) assert.equal(rv.move(b, at, 1), null);
});
test('reversi flips all eight directions and never wraps across edges', () => {
  const b = Array(64).fill(0), at = 27;
  for (const step of [-9,-8,-7,-1,1,7,8,9]) { b[at+step] = 2; b[at+step*2] = 1; }
  assert.equal(rv.flips(b, at, 1).length, 8);
  const edge = Array(64).fill(0); edge[8] = 2; edge[9] = 1; assert.deepEqual(rv.flips(edge, 7, 1), []);
});
test('reversi auto-passes a blocked player and scores a terminal board', () => {
  let b = Array(64).fill(1); b[0] = b[63] = 0; b[1] = b[62] = 2;
  const pass = rv.move(b, 0, 1); assert.equal(pass.passed, 2); assert.equal(pass.turn, 1); assert.equal(pass.winner, null);
  const end = rv.move(pass.board, 63, 1); assert.equal(end.winner, 1);
  b = Array(64).fill(2); b[0] = 0; b[1] = 1; assert.equal(rv.move(b, 0, 2).winner, 2);
});
test('reversi computer chooses a legal corner, full games finish and terminal boards have no move', () => {
  const b = Array(64).fill(0); b[1] = 2; b[2] = 1; assert.equal(rv.ai(b, 1), 0);
  let board = rv.initial(), side = 1, end = null, steps = 0;
  while (!end && steps++ < 61) { const at = rv.ai(board, side); assert.ok(rv.moves(board, side).includes(at)); const move = rv.move(board, at, side); board = move.board; side = move.turn; end = move.winner; }
  assert.ok(end); assert.ok(steps <= 60); assert.equal(rv.ai(board, 1), -1); assert.equal(rv.ai(board, 2), -1);
});
