(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./entertainment-rules.js').landlord);
  else root.AcademicGames.poker = factory(root.AcademicGames.landlord);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (base) {
  'use strict';
  function rank(id) { return base.rank(id % 54); }
  function label(id) { return base.label(id % 54); }
  function face(r) { return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王' })[r] || String(r); }
  function value(r, game) { return game.kind === 'guandan' ? r === game.level ? 15 : r === 15 ? 2 : r : r; }
  function wild(game, id) { return game.kind === 'laizi' ? rank(id) === game.wildRank : game.kind === 'guandan' && id % 54 < 52 && id % 54 % 4 === 1 && rank(id) === game.level; }
  function sort(hand, game) { return hand.slice().sort(function (a, b) { return value(rank(a), game) - value(rank(b), game) || a - b; }); }
  function shuffled(n, random) { var deck = Array.from({ length: n }, function (_, i) { return i; }); for (var i = n - 1; i > 0; i--) { var at = Math.floor(random() * (i + 1)), t = deck[i]; deck[i] = deck[at]; deck[at] = t; } return deck; }
  function create(kind, random, level) {
    random = random || Math.random;
    if (kind === 'laizi') { var game = base.create(random); game.kind = kind; game.wildRank = 3 + Math.floor(random() * 13); game.log = ['癞子已指定为' + face(game.wildRank) + '，你先叫分。']; return game; }
    if (!['guandan', 'fivetenk'].includes(kind)) throw new Error('Unknown poker variant');
    var deck = shuffled(108, random), game = { kind: kind, level: Number.isInteger(level) && level >= 3 && level <= 15 ? level : 15, hands: [], phase: 'play', turn: 0, last: null, lastPlayer: null, passes: [], plays: [null,null,null,null], finish: [], winner: null, scores: [0,0], pot: 0, played: [], log: ['双副牌已发牌，你与电脑 2 为搭档，你先出牌。'] };
    for (var seat = 0; seat < 4; seat++) game.hands.push(sort(deck.slice(seat * 27, (seat + 1) * 27), game)); return game;
  }
  function strength(p) {
    if (p.type === 'rocket') return 10000;
    if (p.type === 'bomb') return p.tier != null ? 1000 + p.tier * 100 : 1000 + p.count * 100;
    if (p.type === 'flush') return 1550;
    if (p.type === '510k') return 500 + p.suit;
    return 0;
  }
  function beats(next, previous) {
    if (!next) return false; if (!previous) return true;
    var a = strength(next), b = strength(previous);
    if (a || b) return a !== b ? a > b : next.type === previous.type && next.main > previous.main;
    return next.type === previous.type && next.count === previous.count && next.length === previous.length && next.main > previous.main;
  }
  var names = { single: '单张', pair: '对子', triple: '三张', 'triple-single': '三带一', 'triple-pair': '三带二', straight: '顺子', 'pair-run': '连对', airplane: '钢板／连三张', 'airplane-single': '飞机带单', 'airplane-pair': '飞机带对', 'four-single': '四带二', 'four-pair': '四带两对', bomb: '炸弹', flush: '同花顺', rocket: '王炸', '510k': '5·10·K' };
  function describe(p) {
    if (!p) return '';
    var text = p.type === 'bomb' && p.tier ? ['', '软炸', '硬炸', '纯癞子炸'][p.tier] : p.type === '510k' ? p.suit ? '纯 5·10·K（' + ['','♦','♣','♥','♠'][p.suit] + '）' : '杂 5·10·K' : names[p.type];
    text += p.type === 'bomb' ? ' · ' + p.count + '张' : '';
    if (!['rocket','510k'].includes(p.type)) text += ' · ' + face(p.rank);
    if (p.assigned && p.assigned.length) text += '（百搭→' + p.assigned.map(function (item) { return face(item.rank); }).join('、') + '）';
    return text;
  }
  // Templates consume real cards first and only then wildcards. Physical IDs remain unique
  // across two decks; assignments describe interpretation without replacing the real cards.
  function candidates(hand, game, previous) {
    var choices = [], seen = new Set(), isLaizi = game.kind === 'laizi', isGuan = game.kind === 'guandan', pool = hand.filter(function (id) { return wild(game, id); }), groups = {};
    hand.filter(function (id) { return !wild(game, id); }).forEach(function (id) { var r = rank(id); (groups[r] || (groups[r] = [])).push(id); });
    function take(target, suit) {
      var cards = [], assigned = [], usedWild = 0;
      for (var key of Object.keys(target)) {
        var r = Number(key), available = (groups[r] || []).filter(function (id) { return suit == null || id % 54 < 52 && id % 54 % 4 === suit; }), n = target[key];
        cards = cards.concat(available.slice(0, n)); var missing = Math.max(0, n - available.length);
        if (missing && (r >= 16 || usedWild + missing > pool.length)) return null;
        while (missing-- > 0) { var id = pool[usedWild++]; cards.push(id); assigned.push({ id: id, rank: r }); }
      }
      return { cards: cards, assigned: assigned };
    }
    function add(taken, type, main, length, extra) {
      if (!taken || !taken.cards.length) return;
      var p = Object.assign({ type: type, rank: main, main: value(main, game), length: length || 1, count: taken.cards.length, assigned: taken.assigned }, extra || {});
      if (type === 'bomb' && isLaizi) p.tier = taken.cards.every(function (id) { return wild(game, id); }) ? 3 : taken.assigned.length ? 1 : 2;
      if (type === 'bomb' && isLaizi && p.tier === 3 && main !== game.wildRank) return;
      p.key = [p.type,p.main,p.length,p.count,p.tier || 0,p.suit || 0].join(':');
      var key = taken.cards.slice().sort(function (a,b) { return a-b; }).join(',') + '/' + p.key;
      if (!seen.has(key) && beats(p, previous)) { seen.add(key); choices.push({ cards: taken.cards, pattern: p }); }
    }
    function repeat(r, count) { var target = {}; target[r] = count; return target; }
    // A lone wildcard is its printed value; it cannot become a joker or arbitrary single.
    hand.forEach(function (id) { add({ cards: [id], assigned: [] }, 'single', rank(id)); });
    for (var r = 3; r <= 17; r++) {
      for (var n = 2; n <= (r >= 16 ? isLaizi ? 1 : 2 : isLaizi ? 4 : 10); n++) add(take(repeat(r,n)), n === 2 ? 'pair' : n === 3 ? 'triple' : 'bomb', r);
      if (r >= 16) continue;
      for (var wing = 3; wing <= 17; wing++) if (wing !== r) {
        if (isLaizi) { var single = repeat(r,3); single[wing] = 1; add(take(single), 'triple-single', r); }
        var pair = repeat(r,3); pair[wing] = 2; add(take(pair), 'triple-pair', r);
      }
    }
    var jokers = hand.filter(function (id) { return rank(id) >= 16; });
    if (isLaizi && jokers.length === 2) add({ cards: jokers, assigned: [] }, 'rocket', 17);
    if (!isLaizi && jokers.length === 4) add({ cards: jokers, assigned: [] }, 'rocket', 17);
    function runs(width, length) {
      var sequences = [];
      for (var start = isGuan ? 2 : 3; start + length - 1 <= 14; start++) sequences.push(Array.from({ length: length }, function (_, i) { var r = start + i; return r === 2 ? 15 : r; }));
      if (isGuan) sequences.unshift([14,15,3,4,5].slice(0,length));
      sequences.forEach(function (rs, index) {
        var target = {}; rs.forEach(function (r) { target[r] = width; });
        var type = width === 1 ? 'straight' : width === 2 ? 'pair-run' : 'airplane', main = rs[rs.length - 1], taken = take(target);
        // Sequence comparison follows natural sequence order, never the level-card order.
        var sequenceMain = isGuan ? index + 1 : main;
        add(taken, type, main, length, { main: sequenceMain });
        if (isGuan && width === 1) for (var suit = 0; suit < 4; suit++) add(take(target,suit), 'flush', main, length, { main: sequenceMain });
        if (isLaizi && width === 3) { wings(taken, rs, length, 1, 'airplane-single', main); wings(taken, rs, length, 2, 'airplane-pair', main); }
      });
    }
    function wings(body, bodyRanks, count, width, type, main) {
      if (!body) return;
      var remaining = hand.filter(function (id) { return !body.cards.includes(id) && (!bodyRanks.includes(rank(id)) || wild(game,id)); });
      var taken = { cards: body.cards.slice(), assigned: body.assigned.slice() }, c = {}, restWild = remaining.filter(function (id) { return wild(game,id); });
      remaining.filter(function (id) { return !wild(game,id); }).forEach(function (id) { var r = rank(id); (c[r] || (c[r] = [])).push(id); });
      if (width === 1) {
        var singles = Object.values(c).flatMap(function (ids) { return ids.slice(0,2); }).slice(0,count);
        taken.cards = taken.cards.concat(singles);
        while (singles.length < count && restWild.length) {
          var target = 3; while (bodyRanks.includes(target) || taken.cards.filter(function (id) { var assignment = taken.assigned.find(function (a) { return a.id === id; }); return (assignment ? assignment.rank : rank(id)) === target; }).length >= 2) target++;
          var id = restWild.shift(); taken.cards.push(id); taken.assigned.push({id:id,rank:target}); singles.push(id);
        }
        if (singles.length === count) add(taken,type,main,bodyRanks.length);
      } else {
        var pairs = 0;
        var pairRanks = Array.from({length:15},function(_,index){return index+3;}).sort(function(a,b){return Math.min((c[b] || []).length,2)-Math.min((c[a] || []).length,2) || a-b;});
        for (var r of pairRanks) {
          if (pairs >= count) break;
          if (bodyRanks.includes(r)) continue; var available = c[r] || [], missing = Math.max(0,2-available.length);
          if (missing > restWild.length || r >= 16 && missing) continue;
          taken.cards = taken.cards.concat(available.slice(0,2));
          while (missing-- > 0) { var id = restWild.shift(); taken.cards.push(id); taken.assigned.push({id:id,rank:r}); } pairs++;
        }
        if (pairs === count) add(taken,type,main,bodyRanks.length);
      }
    }
    if (isGuan) { runs(1,5); runs(2,3); runs(3,2); }
    else {
      for (var length = 5; length <= Math.min(12, hand.length); length++) runs(1,length);
      for (var length = 3; length <= Math.min(12, Math.floor(hand.length/2)); length++) runs(2,length);
      for (var length = 2; length <= Math.min(6, Math.floor(hand.length/3)); length++) runs(3,length);
      if (isLaizi) for (var r = 3; r <= 15; r++) { var body = take(repeat(r,4)); wings(body,[r],2,1,'four-single',r); wings(body,[r],2,2,'four-pair',r); }
    }
    if (game.kind === 'fivetenk') {
      var a = hand.filter(function (id) { return rank(id) === 5; }), b = hand.filter(function (id) { return rank(id) === 10; }), c = hand.filter(function (id) { return rank(id) === 13; });
      a.forEach(function (five) { b.forEach(function (ten) { c.forEach(function (king) { var suit = five % 54 % 4; add({ cards: [five,ten,king], assigned: [] }, '510k',13,1,{suit: suit === ten % 54 % 4 && suit === king % 54 % 4 ? [4,3,2,1][suit] : 0}); }); }); });
    }
    return choices.sort(function (a,b) { return strength(a.pattern) - strength(b.pattern) || a.pattern.main - b.pattern.main || a.pattern.key.localeCompare(b.pattern.key); });
  }
  function patterns(cards, game, previous) {
    if (!cards.length || new Set(cards).size !== cards.length || cards.some(function (id) { return !Number.isInteger(id) || id < 0 || id >= (game.kind === 'laizi' ? 54 : 108); })) return [];
    var target = cards.slice().sort(function(a,b){return a-b;}).join(',');
    return candidates(cards,game,previous).filter(function (choice) { return choice.cards.slice().sort(function(a,b){return a-b;}).join(',') === target; });
  }
  function points(cards) { return cards.reduce(function (sum,id) { var r = rank(id); return sum + (r === 5 ? 5 : r === 10 || r === 13 ? 10 : 0); },0); }
  function nextActive(game, seat) { for (var n = 1; n <= 4; n++) if (game.hands[(seat+n)%4].length) return (seat+n)%4; return seat; }
  function write(game, text) { game.log.push(text); game.log = game.log.slice(-24); }
  function seatName(seat) { return seat === 0 ? '你' : '电脑 ' + seat; }
  function finishTeam(game) {
    var last = game.hands.findIndex(function(hand){return hand.length;}); game.finish.push(last); game.phase = 'over';
    if (game.kind === 'fivetenk') {
      game.scores[game.lastPlayer%2] += game.pot; game.pot = 0;
      game.scores[game.finish[0]%2] += points(game.hands[last]);
      game.winner = game.scores[0] === game.scores[1] ? game.finish[0]%2 : game.scores[0] > game.scores[1] ? 0 : 1;
    } else game.winner = game.finish[0]%2;
    write(game, (game.winner === 0 ? '我方' : '对方') + '获胜。');
  }
  function play(game, seat, cards, key) {
    if (game.phase !== 'play' || game.turn !== seat || new Set(cards).size !== cards.length || cards.some(function(id){return !game.hands[seat].includes(id);})) return false;
    if (game.kind === 'laizi') {
      if (!cards.length) {
        if (!game.last || game.lastPlayer === seat) return false;
        game.plays[seat] = []; if (++game.passes === 2) { game.last = null; game.passes = 0; game.plays = [null,null,null]; }
      } else {
        var options = patterns(cards,game,game.last), chosen = key ? options.find(function(option){return option.pattern.key === key;}) : options[0]; if (!chosen) return false;
        game.hands[seat] = game.hands[seat].filter(function(id){return !cards.includes(id);}); game.last = chosen.pattern; game.lastPlayer = seat; game.passes = 0; game.plays[seat] = sort(cards,game);
        if (!game.hands[seat].length) { game.phase = 'over'; game.winner = seat; }
      }
      game.turn = (seat+1)%3;
    } else {
      if (!game.hands[seat].length) return false;
      if (!cards.length) {
        if (!game.last || game.lastPlayer === seat) return false;
        game.plays[seat] = []; game.passes.push(seat);
        var others = game.hands.map(function(hand,index){return hand.length && index !== game.lastPlayer ? index : -1;}).filter(function(index){return index >= 0;});
        if (others.every(function(index){return game.passes.includes(index);})) {
          if (game.kind === 'fivetenk') { game.scores[game.lastPlayer%2] += game.pot; game.pot = 0; }
          var mate = (game.lastPlayer+2)%4;
          game.turn = game.hands[game.lastPlayer].length ? game.lastPlayer : game.hands[mate].length ? mate : nextActive(game,game.lastPlayer);
          game.last = null; game.plays = [null,null,null,null]; game.passes = [];
          write(game,'本圈结束，' + seatName(game.turn) + '领出。'); return true;
        }
      } else {
        var options = patterns(cards,game,game.last), chosen = key ? options.find(function(option){return option.pattern.key === key;}) : options[0]; if (!chosen) return false;
        game.hands[seat] = game.hands[seat].filter(function(id){return !cards.includes(id);}); game.played = game.played.concat(cards);
        game.last = chosen.pattern; game.lastPlayer = seat; game.passes = []; game.plays[seat] = sort(cards,game); if (game.kind === 'fivetenk') game.pot += points(cards);
        if (!game.hands[seat].length) { game.finish.push(seat); write(game,seatName(seat)+'第 '+game.finish.length+' 名出完。'); }
        if (game.finish.length === 3) finishTeam(game);
      }
      game.turn = nextActive(game,seat);
    }
    write(game, seatName(seat) + (cards.length ? '：' + cards.map(label).join(' ') + ' · ' + describe(game.last) : '：不出')); return true;
  }
  function ai(game, seat, hint) {
    var options = candidates(game.hands[seat],game,game.last), sameTeam = game.kind === 'laizi' ? seat !== game.landlord && game.lastPlayer !== game.landlord : game.lastPlayer != null && seat % 2 === game.lastPlayer % 2;
    if (!hint && game.last && sameTeam && options.every(function(option){return option.cards.length !== game.hands[seat].length;})) return {cards:[],key:null};
    options.sort(function(a,b){function cost(option){return strength(option.pattern)*.1+option.pattern.main-(game.last?0:option.cards.length*12)-(option.cards.length===game.hands[seat].length?10000:0);}return cost(a)-cost(b);});
    return options.length ? {cards:options[0].cards,key:options[0].pattern.key} : {cards:[],key:null};
  }
  return { create:create, rank:rank, label:label, face:face, sort:sort, wild:wild, patterns:patterns, candidates:candidates, beats:beats, describe:describe, play:play, ai:ai, points:points };
}));
