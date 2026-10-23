(function (root, factory) {
  var extra = factory();
  if (typeof module === 'object' && module.exports) module.exports = extra;
  else Object.assign(root.AcademicGames, extra);
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function shuffle(items, random) {
    var result = items.slice(); random = random || Math.random;
    for (var i = result.length - 1; i > 0; i--) { var j = Math.floor(random() * (i + 1)), temp = result[i]; result[i] = result[j]; result[j] = temp; }
    return result;
  }

  // 三门无字休闲麻将：108 张、不吃、不计番、无抢杠和加杠。
  function tileLabel(tile) { return ['一', '二', '三', '四', '五', '六', '七', '八', '九'][tile % 9] + ['万', '筒', '条'][Math.floor(tile / 9)]; }
  function counts(hand) { var result = Array(27).fill(0); hand.forEach(function (tile) { result[tile]++; }); return result; }
  function winning(hand, melds) {
    melds = melds || 0;
    if (!Number.isInteger(melds) || melds < 0 || melds > 4 || hand.length !== 14 - 3 * melds || hand.some(function (t) { return !Number.isInteger(t) || t < 0 || t > 26; })) return false;
    var c = counts(hand);
    if (c.some(function (n) { return n > 4; })) return false;
    if (!melds && c.every(function (n) { return n % 2 === 0; })) return true;
    function groups(left) {
      var at = left.findIndex(function (n) { return n > 0; });
      if (at < 0) return true;
      if (left[at] >= 3) { left[at] -= 3; if (groups(left)) { left[at] += 3; return true; } left[at] += 3; }
      if (at % 9 < 7 && left[at + 1] && left[at + 2]) {
        left[at]--; left[at + 1]--; left[at + 2]--;
        var ok = groups(left); left[at]++; left[at + 1]++; left[at + 2]++; if (ok) return true;
      }
      return false;
    }
    for (var pair = 0; pair < 27; pair++) if (c[pair] >= 2) { c[pair] -= 2; var ok = groups(c); c[pair] += 2; if (ok) return true; }
    return false;
  }
  function sortHand(game, seat) { game.hands[seat].sort(function (a, b) { return a - b; }); }
  function log(game, line) { game.log.push(line); game.log = game.log.slice(-24); }
  function player(seat) { return seat === 0 ? '你' : '电脑 ' + seat; }
  function finish(game, seat, type, tile, from) { game.phase = 'over'; game.winner = seat; game.result = { type: type, tile: tile, from: from }; log(game, player(seat) + (type === 'self' ? '自摸胡牌' : '胡牌 · ' + player(from) + '点炮')); }
  function draw(game, seat) {
    game.pending = null; game.turn = seat;
    if (!game.wall.length) { game.phase = 'over'; game.winner = 'draw'; log(game, '牌墙已空，本局流局。'); return; }
    var tile = game.wall.pop(); game.hands[seat].push(tile); sortHand(game, seat); game.lastDraw = tile; game.phase = 'discard';
    log(game, player(seat) + '摸牌');
  }
  function newMahjong(random) {
    var deck = shuffle(Array.from({ length: 108 }, function (_, i) { return Math.floor(i / 4); }), random);
    var game = { wall: deck, hands: [[], [], [], []], melds: [[], [], [], []], discards: [[], [], [], []], turn: 0, phase: 'discard', winner: null, pending: null, lastDiscard: null, lastDraw: null, result: null, log: ['已发牌，你为庄家，先打出一张牌。'] };
    for (var i = 0; i < 13; i++) for (var seat = 0; seat < 4; seat++) game.hands[seat].push(deck.pop());
    game.lastDraw = deck.pop(); game.hands[0].push(game.lastDraw); game.hands.forEach(function (_, s) { sortHand(game, s); }); return game;
  }
  function selfOptions(game, seat) {
    if (game.phase !== 'discard' || game.turn !== seat) return { win: false, kongs: [] };
    return { win: game.lastDraw !== null && winning(game.hands[seat], game.melds[seat].length), kongs: game.wall.length ? counts(game.hands[seat]).map(function (n, tile) { return n === 4 ? tile : -1; }).filter(function (tile) { return tile >= 0; }) : [] };
  }
  function nextClaim(game) {
    var pending = game.pending;
    if (!pending.queue.length) { var next = (pending.from + 1) % 4; draw(game, next); return; }
    var claimant = pending.queue.shift(); pending.seat = claimant.seat; pending.actions = claimant.actions; game.turn = claimant.seat; game.phase = 'claim';
  }
  function discard(game, seat, tile) {
    if (game.phase !== 'discard' || game.turn !== seat || !game.hands[seat].includes(tile)) return false;
    game.hands[seat].splice(game.hands[seat].indexOf(tile), 1); game.discards[seat].push(tile); game.lastDiscard = { seat: seat, tile: tile }; game.lastDraw = null;
    log(game, player(seat) + '打出' + tileLabel(tile));
    var wins = [], sets = [];
    for (var distance = 1; distance <= 3; distance++) {
      var other = (seat + distance) % 4, hand = game.hands[other], n = hand.filter(function (t) { return t === tile; }).length;
      if (winning(hand.concat(tile), game.melds[other].length)) wins.push({ seat: other, actions: ['win'] });
      if (n >= 2) sets.push({ seat: other, actions: (n === 3 && game.wall.length ? ['kong'] : []).concat('pung') });
    }
    game.pending = { tile: tile, from: seat, queue: wins.concat(sets) }; nextClaim(game); return true;
  }
  function claim(game, seat, action) {
    if (game.phase !== 'claim' || game.turn !== seat || !game.pending || action !== 'pass' && !game.pending.actions.includes(action)) return false;
    var pending = game.pending, tile = pending.tile;
    if (action === 'pass') { nextClaim(game); return true; }
    // A claimed discard moves to the winning hand or exposed meld, never both.
    game.discards[pending.from].pop();
    if (action === 'win') { game.hands[seat].push(tile); sortHand(game, seat); finish(game, seat, 'discard', tile, pending.from); game.pending = null; return true; }
    var n = action === 'kong' ? 3 : 2;
    for (var i = 0; i < n; i++) game.hands[seat].splice(game.hands[seat].indexOf(tile), 1);
    game.melds[seat].push({ tile: tile, count: n + 1, concealed: false }); log(game, player(seat) + (action === 'kong' ? '杠' : '碰') + tileLabel(tile));
    game.pending = null; game.turn = seat; game.phase = 'discard'; game.lastDraw = null;
    if (action === 'kong') draw(game, seat); return true;
  }
  function selfWin(game, seat) { if (!selfOptions(game, seat).win) return false; finish(game, seat, 'self', game.lastDraw, seat); return true; }
  function concealedKong(game, seat, tile) {
    if (!selfOptions(game, seat).kongs.includes(tile)) return false;
    game.hands[seat] = game.hands[seat].filter(function (t) { return t !== tile; }); game.melds[seat].push({ tile: tile, count: 4, concealed: true });
    log(game, player(seat) + '暗杠'); draw(game, seat); return true;
  }
  function discardHint(game, seat) {
    var hand = game.hands[seat], c = counts(hand), best = -1, bestScore = Infinity;
    hand.forEach(function (tile) {
      var rank = tile % 9, score = c[tile] >= 3 ? 12 : c[tile] === 2 ? 7 : 0;
      if (rank > 0) score += c[tile - 1] * 2; if (rank < 8) score += c[tile + 1] * 2;
      if (rank > 1) score += c[tile - 2]; if (rank < 7) score += c[tile + 2];
      score += Math.min(rank, 8 - rank) * .1;
      if (score < bestScore) { bestScore = score; best = tile; }
    }); return best;
  }
  function mahjongAI(game) {
    var seat = game.turn;
    if (game.phase === 'over') return false;
    if (game.phase === 'claim') return claim(game, seat, game.pending.actions[0]);
    var options = selfOptions(game, seat);
    if (options.win) return selfWin(game, seat);
    if (options.kongs.length) return concealedKong(game, seat, options.kongs[0]);
    return discard(game, seat, discardHint(game, seat));
  }

  // 黑白棋：夹住对方棋子后翻转；无合法落点自动让行，双方均无落点结算。
  var dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  function reversiInitial() { var board = Array(64).fill(0); board[27] = board[36] = 2; board[28] = board[35] = 1; return board; }
  function flips(board, at, side) {
    if (!Number.isInteger(at) || at < 0 || at >= 64 || board[at] || (side !== 1 && side !== 2)) return [];
    var result = [], row = Math.floor(at / 8), col = at % 8;
    dirs.forEach(function (d) {
      var r = row + d[0], c = col + d[1], line = [];
      while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === 3 - side) { line.push(r * 8 + c); r += d[0]; c += d[1]; }
      if (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === side) result = result.concat(line);
    }); return result;
  }
  function reversiMoves(board, side) { return board.map(function (_, at) { return at; }).filter(function (at) { return flips(board, at, side).length; }); }
  function reversiMove(board, at, side) {
    var captured = flips(board, at, side); if (!captured.length) return null;
    var next = board.slice(); next[at] = side; captured.forEach(function (index) { next[index] = side; });
    var turn = 3 - side, passed = null, winner = null;
    if (!reversiMoves(next, turn).length) { passed = turn; turn = side; if (!reversiMoves(next, turn).length) { var black = next.filter(function (s) { return s === 1; }).length, white = next.filter(function (s) { return s === 2; }).length; winner = black === white ? 'draw' : black > white ? 1 : 2; } }
    return { board: next, turn: turn, passed: passed, winner: winner, captured: captured.length };
  }
  function reversiAI(board, side) {
    var moves = reversiMoves(board, side), best = -1, bestScore = -Infinity;
    moves.forEach(function (at) {
      var next = reversiMove(board, at, side), corner = [0,7,56,63].includes(at), nearCorner = [[0,1,8,9],[7,6,14,15],[56,48,49,57],[63,54,55,62]].some(function (group) { return !board[group[0]] && group.slice(1).includes(at); });
      var score = (corner ? 1000 : 0) - (nearCorner ? 150 : 0) - reversiMoves(next.board, 3 - side).length * 5 + next.captured;
      if (next.winner === side) score += 10000;
      if (score > bestScore) { bestScore = score; best = at; }
    }); return best;
  }
  return { mahjong: { create: newMahjong, label: tileLabel, winning: winning, options: selfOptions, discard: discard, claim: claim, win: selfWin, kong: concealedKong, hint: discardHint, ai: mahjongAI }, reversi: { initial: reversiInitial, flips: flips, moves: reversiMoves, move: reversiMove, ai: reversiAI } };
}));
