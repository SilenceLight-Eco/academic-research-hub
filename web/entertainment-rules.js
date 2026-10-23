(function (root, factory) {
  var games = factory();
  if (typeof module === 'object' && module.exports) module.exports = games;
  else root.AcademicGames = games;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function inside(r, c, rows, cols) { return r >= 0 && r < rows && c >= 0 && c < cols; }
  function shuffle(values, random) {
    var result = values.slice(); random = random || Math.random;
    for (var i = result.length - 1; i > 0; i--) { var j = Math.floor(random() * (i + 1)), temp = result[i]; result[i] = result[j]; result[j] = temp; }
    return result;
  }

  // 五子棋：自由规则，连成五子或更多获胜，不设禁手。
  var directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  function gomokuWin(board, at, side) {
    return directions.some(function (d) {
      var count = 1, r = Math.floor(at / 15), c = at % 15;
      [-1, 1].forEach(function (sign) {
        for (var n = 1; n < 15; n++) {
          var nr = r + d[0] * n * sign, nc = c + d[1] * n * sign;
          if (!inside(nr, nc, 15, 15) || board[nr * 15 + nc] !== side) break;
          count++;
        }
      });
      return count >= 5;
    });
  }
  function gomokuMove(board, at, side) {
    if (!Number.isInteger(at) || at < 0 || at >= 225 || board[at] || (side !== 1 && side !== 2)) return null;
    var next = board.slice(); next[at] = side;
    return { board: next, winner: gomokuWin(next, at, side) ? side : next.every(Boolean) ? 'draw' : null };
  }
  function gomokuScore(board, at, side) {
    var next = board.slice(); next[at] = side;
    if (gomokuWin(next, at, side)) return 1000000;
    var score = 0, r = Math.floor(at / 15), c = at % 15;
    directions.forEach(function (d) {
      var count = 1, open = 0;
      [-1, 1].forEach(function (sign) {
        for (var n = 1; n <= 5; n++) {
          var nr = r + d[0] * n * sign, nc = c + d[1] * n * sign;
          if (!inside(nr, nc, 15, 15)) break;
          var cell = next[nr * 15 + nc];
          if (cell === side) count++; else { if (!cell) open++; break; }
        }
      });
      score += ([0, 2, 18, 160, 2400, 1000000][Math.min(count, 5)] || 0) * (open === 2 ? 3 : open === 1 ? 1 : 0);
    });
    return score;
  }
  function gomokuAI(board, side) {
    if (board.every(function (cell) { return !cell; })) return 112;
    var best = -1, bestScore = -Infinity;
    for (var at = 0; at < 225; at++) {
      if (board[at]) continue;
      var r = Math.floor(at / 15), c = at % 15, near = false;
      for (var dr = -2; dr <= 2; dr++) for (var dc = -2; dc <= 2; dc++) if (inside(r + dr, c + dc, 15, 15) && board[(r + dr) * 15 + c + dc]) near = true;
      if (!near) continue;
      var attack = gomokuScore(board, at, side), defend = gomokuScore(board, at, 3 - side);
      var score = attack >= 1000000 ? 100000000 : defend >= 1000000 ? 10000000 : attack + defend * 1.15;
      score -= (Math.abs(r - 7) + Math.abs(c - 7)) * 0.1;
      if (score > bestScore) { bestScore = score; best = at; }
    }
    return best;
  }

  // 中国象棋：走子、蹩马腿、塞象眼、将帅照面、自将、困毙。
  function chessInitial() {
    var board = Array(90).fill(null), order = ['R', 'H', 'E', 'A', 'K', 'A', 'E', 'H', 'R'];
    order.forEach(function (piece, c) { board[c] = 'b' + piece; board[81 + c] = 'r' + piece; });
    [1, 7].forEach(function (c) { board[18 + c] = 'bC'; board[63 + c] = 'rC'; });
    [0, 2, 4, 6, 8].forEach(function (c) { board[27 + c] = 'bP'; board[54 + c] = 'rP'; });
    return board;
  }
  function palace(r, c, side) { return c >= 3 && c <= 5 && (side === 'r' ? r >= 7 && r <= 9 : r >= 0 && r <= 2); }
  function chessPseudo(board, from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= 90 || to >= 90 || from === to || !board[from]) return false;
    var piece = board[from], target = board[to], side = piece[0], type = piece[1];
    if (target && target[0] === side) return false;
    var r = Math.floor(from / 9), c = from % 9, nr = Math.floor(to / 9), nc = to % 9, dr = nr - r, dc = nc - c;
    if (type === 'H') return Math.abs(dr) === 2 && Math.abs(dc) === 1 ? !board[(r + Math.sign(dr)) * 9 + c] : Math.abs(dr) === 1 && Math.abs(dc) === 2 && !board[r * 9 + c + Math.sign(dc)];
    if (type === 'E') return Math.abs(dr) === 2 && Math.abs(dc) === 2 && (side === 'r' ? nr >= 5 : nr <= 4) && !board[(r + dr / 2) * 9 + c + dc / 2];
    if (type === 'A') return Math.abs(dr) === 1 && Math.abs(dc) === 1 && palace(nr, nc, side);
    if (type === 'P') return dc === 0 && dr === (side === 'r' ? -1 : 1) || dr === 0 && Math.abs(dc) === 1 && (side === 'r' ? r <= 4 : r >= 5);
    if (type === 'K' && Math.abs(dr) + Math.abs(dc) === 1 && palace(nr, nc, side)) return true;
    if (dr !== 0 && dc !== 0) return false;
    var screens = 0, step = dr === 0 ? Math.sign(dc) : Math.sign(dr) * 9;
    for (var p = from + step; p !== to; p += step) if (board[p]) screens++;
    if (type === 'R') return screens === 0;
    if (type === 'C') return screens === (target ? 1 : 0);
    return type === 'K' && dc === 0 && target === (side === 'r' ? 'bK' : 'rK') && screens === 0;
  }
  function chessCheck(board, side) {
    var king = board.indexOf(side + 'K');
    if (king < 0) return true;
    return board.some(function (piece, from) { return piece && piece[0] !== side && chessPseudo(board, from, king); });
  }
  function chessLegal(board, from, to, side) {
    if (!board[from] || board[from][0] !== side || !chessPseudo(board, from, to)) return false;
    var next = board.slice(); next[to] = next[from]; next[from] = null;
    return !chessCheck(next, side);
  }
  function chessMoves(board, side) {
    var moves = [];
    board.forEach(function (piece, from) {
      if (!piece || piece[0] !== side) return;
      for (var to = 0; to < 90; to++) if (chessLegal(board, from, to, side)) moves.push({ from: from, to: to });
    });
    return moves;
  }
  function chessApply(board, move) { var next = board.slice(); next[move.to] = next[move.from]; next[move.from] = null; return next; }
  var pieceValue = { K: 100000, R: 900, C: 450, H: 400, E: 200, A: 200, P: 100 };
  function chessValue(board, side) {
    return board.reduce(function (score, piece, at) {
      if (!piece) return score;
      var progress = piece[0] === 'r' ? 9 - Math.floor(at / 9) : Math.floor(at / 9);
      var value = pieceValue[piece[1]] + (piece[1] === 'P' ? progress * 12 : piece[1] === 'H' || piece[1] === 'C' ? 4 - Math.abs(at % 9 - 4) : 0);
      return score + (piece[0] === side ? value : -value);
    }, 0);
  }
  function chessAI(board, side) {
    var enemy = side === 'r' ? 'b' : 'r', moves = chessMoves(board, side);
    moves.sort(function (a, b) { return chessValue(chessApply(board, b), side) - chessValue(chessApply(board, a), side); });
    var best = null, bestScore = -Infinity;
    moves.slice(0, 18).forEach(function (move) {
      var next = chessApply(board, move), replies = chessMoves(next, enemy), score;
      if (!replies.length) score = 1000000;
      else score = Math.min.apply(null, replies.map(function (reply) { return chessValue(chessApply(next, reply), side); }));
      if (score > bestScore) { bestScore = score; best = move; }
    });
    return best;
  }

  // 斗地主：休闲三人玩法，无积分或下注。
  function rank(id) { return id < 52 ? Math.floor(id / 4) + 3 : id === 52 ? 16 : 17; }
  function sortCards(cards) { return cards.slice().sort(function (a, b) { return rank(a) - rank(b) || a - b; }); }
  function cardLabel(id) { return id >= 52 ? id === 52 ? '小王' : '大王' : ['♠', '♥', '♣', '♦'][id % 4] + ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' }[rank(id)] || rank(id)); }
  function cardGroups(cards) {
    var groups = new Map();
    sortCards(cards).forEach(function (id) { var r = rank(id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(id); });
    return groups;
  }
  function run(values) { return values.every(function (value, i) { return value < 15 && (!i || value === values[i - 1] + 1); }); }
  function pattern(cards) {
    if (!cards.length || new Set(cards).size !== cards.length || cards.some(function (id) { return !Number.isInteger(id) || id < 0 || id > 53; })) return null;
    var groups = cardGroups(cards), ranks = Array.from(groups.keys()), sizes = ranks.map(function (r) { return groups.get(r).length; }), n = cards.length;
    function result(type, main, length) { return { type: type, main: main, length: length || 1, count: n }; }
    if (n === 2 && ranks[0] === 16 && ranks[1] === 17) return result('rocket', 17);
    if (ranks.length === 1) return result(({ 1: 'single', 2: 'pair', 3: 'triple', 4: 'bomb' })[n], ranks[0]);
    var triple = ranks.filter(function (r) { return groups.get(r).length === 3; });
    if (n === 4 && triple.length === 1) return result('triple-single', triple[0]);
    if (n === 5 && triple.length === 1 && sizes.includes(2)) return result('triple-pair', triple[0]);
    if (n >= 5 && sizes.every(function (v) { return v === 1; }) && run(ranks)) return result('straight', ranks[ranks.length - 1], ranks.length);
    if (n >= 6 && sizes.every(function (v) { return v === 2; }) && run(ranks)) return result('pair-run', ranks[ranks.length - 1], ranks.length);
    var four = ranks.find(function (r) { return groups.get(r).length === 4; });
    if (four != null && n === 6) return result('four-single', four);
    if (four != null && n === 8 && sizes.filter(function (v) { return v === 2; }).length === 2) return result('four-pair', four);
    for (var length = 2; length <= triple.length; length++) for (var start = 0; start + length <= triple.length; start++) {
      var body = triple.slice(start, start + length);
      if (!run(body)) continue;
      var wings = ranks.filter(function (r) { return !body.includes(r); }), wingSizes = wings.map(function (r) { return groups.get(r).length; });
      if (n === length * 3 && !wings.length) return result('airplane', body[length - 1], length);
      if (n === length * 4 && wingSizes.every(function (v) { return v <= 2; })) return result('airplane-single', body[length - 1], length);
      if (n === length * 5 && wings.length === length && wingSizes.every(function (v) { return v === 2; })) return result('airplane-pair', body[length - 1], length);
    }
    return null;
  }
  function beats(next, previous) {
    if (!next || !next.type) return false;
    if (!previous) return true;
    if (previous.type === 'rocket') return false;
    if (next.type === 'rocket') return true;
    if (next.type === 'bomb' && previous.type !== 'bomb') return true;
    return next.type === previous.type && next.count === previous.count && next.length === previous.length && next.main > previous.main;
  }
  function candidates(hand, previous) {
    var groups = cardGroups(hand), ranks = Array.from(groups.keys()), choices = [], seen = new Set();
    function add(cards) { var p = pattern(cards), key = sortCards(cards).join(','); if (beats(p, previous) && !seen.has(key)) { seen.add(key); choices.push({ cards: cards, pattern: p }); } }
    ranks.forEach(function (r) {
      var cards = groups.get(r);
      for (var n = 1; n <= cards.length; n++) add(cards.slice(0, n));
      if (cards.length >= 3) ranks.forEach(function (wing) { if (wing !== r) { add(cards.slice(0, 3).concat(groups.get(wing).slice(0, 1))); if (groups.get(wing).length >= 2) add(cards.slice(0, 3).concat(groups.get(wing).slice(0, 2))); } });
      if (cards.length === 4) {
        var remaining = hand.filter(function (id) { return rank(id) !== r; });
        if (remaining.length >= 2) add(cards.concat(sortCards(remaining).slice(0, 2)));
        var pairs = ranks.filter(function (wing) { return wing !== r && groups.get(wing).length >= 2; });
        if (pairs.length >= 2) add(cards.concat(groups.get(pairs[0]).slice(0, 2), groups.get(pairs[1]).slice(0, 2)));
      }
    });
    if (hand.includes(52) && hand.includes(53)) add([52, 53]);
    [1, 2, 3].forEach(function (width) {
      for (var start = 3; start <= 14; start++) {
        var body = [];
        for (var end = start; end <= 14 && groups.has(end) && groups.get(end).length >= width; end++) {
          body = body.concat(groups.get(end).slice(0, width));
          var length = end - start + 1;
          if (length < (width === 1 ? 5 : width === 2 ? 3 : 2)) continue;
          add(body);
          if (width !== 3) continue;
          var rest = sortCards(hand.filter(function (id) { return rank(id) < start || rank(id) > end; }));
          var singleWings = [], wingCounts = {};
          rest.forEach(function (id) { var r = rank(id); wingCounts[r] = (wingCounts[r] || 0) + 1; if (wingCounts[r] <= 2 && singleWings.length < length) singleWings.push(id); });
          if (singleWings.length === length) add(body.concat(singleWings));
          var pairWings = ranks.filter(function (r) { return (r < start || r > end) && groups.get(r).length >= 2; });
          if (pairWings.length >= length) add(body.concat.apply(body, pairWings.slice(0, length).map(function (r) { return groups.get(r).slice(0, 2); })));
        }
      }
    });
    return choices;
  }
  function newLandlord(random) {
    var deck = shuffle(Array.from({ length: 54 }, function (_, i) { return i; }), random);
    return { hands: [sortCards(deck.slice(0, 17)), sortCards(deck.slice(17, 34)), sortCards(deck.slice(34, 51))], reserve: deck.slice(51), phase: 'bid', turn: 0, bidCount: 0, maxBid: 0, landlord: null, last: null, lastPlayer: null, passes: 0, winner: null, plays: [null, null, null] };
  }
  function bid(game, seat, value) {
    if (game.phase !== 'bid' || game.turn !== seat || ![0, 1, 2, 3].includes(value) || value && value <= game.maxBid) return false;
    if (value) { game.maxBid = value; game.landlord = seat; }
    game.bidCount++;
    if (value === 3 || game.bidCount === 3) {
      if (game.landlord == null) game.phase = 'redeal';
      else { game.phase = 'play'; game.hands[game.landlord] = sortCards(game.hands[game.landlord].concat(game.reserve)); game.turn = game.landlord; }
    } else game.turn = (seat + 1) % 3;
    return true;
  }
  function bidAI(game, seat) {
    var hand = game.hands[seat], groups = cardGroups(hand), strength = hand.filter(function (id) { return rank(id) >= 15; }).length + Array.from(groups.values()).filter(function (v) { return v.length === 4; }).length * 2;
    var value = strength >= 5 ? 3 : strength >= 3 ? 2 : strength >= 1 ? 1 : 0;
    return value > game.maxBid ? value : 0;
  }
  function landlordPlay(game, seat, cards) {
    if (game.phase !== 'play' || game.turn !== seat) return false;
    if (!cards.length) {
      if (!game.last || game.lastPlayer === seat) return false;
      game.plays[seat] = [];
      if (++game.passes === 2) { game.last = null; game.passes = 0; game.plays = [null, null, null]; }
    } else {
      var p = pattern(cards);
      if (!beats(p, game.last) || cards.some(function (id) { return !game.hands[seat].includes(id); })) return false;
      game.hands[seat] = game.hands[seat].filter(function (id) { return !cards.includes(id); });
      game.last = p; game.lastPlayer = seat; game.passes = 0; game.plays[seat] = sortCards(cards);
      if (!game.hands[seat].length) { game.phase = 'over'; game.winner = seat; }
    }
    game.turn = (seat + 1) % 3;
    return true;
  }
  function landlordAI(game, seat, hint) {
    var options = candidates(game.hands[seat], game.last);
    var teammateLeading = game.last && seat !== game.landlord && game.lastPlayer !== game.landlord;
    if (teammateLeading && !hint && game.hands[game.lastPlayer].length <= 5) return [];
    options.sort(function (a, b) {
      function score(option) { return (option.pattern.type === 'rocket' ? 220 : option.pattern.type === 'bomb' ? 170 : 0) + option.pattern.main - (game.last ? 0 : option.cards.length * 9) - (option.cards.length === game.hands[seat].length ? 1000 : 0); }
      return score(a) - score(b);
    });
    return options.length ? options[0].cards : [];
  }
  return { gomoku: { move: gomokuMove, win: gomokuWin, ai: gomokuAI }, chess: { initial: chessInitial, pseudo: chessPseudo, check: chessCheck, legal: chessLegal, moves: chessMoves, apply: chessApply, ai: chessAI }, landlord: { rank: rank, label: cardLabel, sort: sortCards, pattern: pattern, beats: beats, candidates: candidates, create: newLandlord, bid: bid, bidAI: bidAI, play: landlordPlay, ai: landlordAI } };
}));
