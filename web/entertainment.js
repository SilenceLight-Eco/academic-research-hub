(function () {
  'use strict';
  var rules = window.AcademicGames, root = null, current = 'landlord', active = false, timer = null, epoch = 0, notice = '';
  var modes = { chess: 'ai', gomoku: 'ai', reversi: 'ai' }, difficulties = { chess: 'normal', gomoku: 'normal', reversi: 'normal' }, sessions = {}, selectedCards = new Set(), chessSelected = null, mahjongSelected = null;
  var titles = { landlord: '斗地主', mahjong: '休闲麻将', chess: '中国象棋', gomoku: '五子棋', reversi: '黑白棋' };
  var names = { rK: '帅', rA: '仕', rE: '相', rH: '马', rR: '车', rC: '炮', rP: '兵', bK: '将', bA: '士', bE: '象', bH: '马', bR: '车', bC: '炮', bP: '卒' };
  function escape(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cancelAI() { if (timer !== null) clearTimeout(timer); timer = null; epoch++; }
  function reset(game) {
    cancelAI(); notice = ''; chessSelected = null; mahjongSelected = null; selectedCards.clear();
    if (game === 'landlord') { sessions[game] = rules.landlord.create(); sessions[game].log = ['已发牌：你先叫分，最高分者成为地主。']; }
    if (game === 'gomoku') sessions[game] = { board: Array(225).fill(0), turn: 1, winner: null, history: [], last: null };
    if (game === 'reversi') sessions[game] = { board: rules.reversi.initial(), turn: 1, winner: null, history: [], last: null, passed: null };
    if (game === 'mahjong') sessions[game] = rules.mahjong.create();
    if (game === 'chess') { var board = rules.chess.initial(); sessions[game] = { board: board, turn: 'r', winner: null, history: [], last: null, quiet: 0, positions: [board.join(',') + ':r'] }; }
  }
  function button(action, label, disabled, extra) { return '<button type="button" data-game-action="' + action + '"' + (disabled ? ' disabled' : '') + (extra || '') + '>' + label + '</button>'; }
  function status(text) { return '<p class="game-status" role="status" aria-live="polite">' + escape(text) + '</p>'; }
  function sideName(side, game) { return game === 'chess' ? side === 'r' ? '红方' : '黑方' : side === 1 ? '黑棋' : '白棋'; }
  function boardStatus(game, session) {
    if (session.winner) return session.winner === 'draw' ? '本局和棋。' : sideName(session.winner, game) + '获胜！';
    var text = sideName(session.turn, game) + '行棋' + (modes[game] === 'ai' && (session.turn === 'b' || session.turn === 2) ? ' · 电脑思考中…' : ' · 请落子');
    if (game === 'chess' && rules.chess.check(session.board, session.turn)) text += '（正在被将军）';
    return text;
  }
  function controls(game) {
    var session = sessions[game];
    return '<div class="game-controls"><label>对弈模式 <select id="entertainmentMode" aria-label="对弈模式"><option value="ai"' + (modes[game] === 'ai' ? ' selected' : '') + '>人机对弈</option><option value="local"' + (modes[game] === 'local' ? ' selected' : '') + '>本机双人</option></select></label><label>电脑难度 <select id="entertainmentDifficulty" aria-label="电脑难度"' + (modes[game] === 'local' ? ' disabled' : '') + '><option value="easy"' + (difficulties[game] === 'easy' ? ' selected' : '') + '>休闲</option><option value="normal"' + (difficulties[game] === 'normal' ? ' selected' : '') + '>标准</option></select></label>' + button('restart', '重新开局') + button('undo', modes[game] === 'ai' ? '悔棋一轮' : '悔棋一步', !session.history.length) + '</div>';
  }
  function gomokuView() {
    var session = sessions.gomoku;
    return controls('gomoku') + status(boardStatus('gomoku', session)) + '<div class="gomoku-board" role="group" aria-label="十五路五子棋棋盘">' + session.board.map(function (stone, at) {
      var row = Math.floor(at / 15), col = at % 15, star = [3, 7, 11].includes(row) && [3, 7, 11].includes(col);
      return '<button type="button" class="gomoku-cell' + (session.last === at ? ' is-last' : '') + '" data-gomoku-cell="' + at + '" aria-label="第' + (row + 1) + '行第' + (col + 1) + '列' + (stone ? '，' + sideName(stone, 'gomoku') : '，空位') + '"' + (stone || session.winner || modes.gomoku === 'ai' && session.turn === 2 ? ' disabled' : '') + '>' + (stone ? '<span class="gomoku-stone stone-' + stone + '"></span>' : star ? '<span class="gomoku-star"></span>' : '') + '</button>';
    }).join('') + '</div><p class="game-help">黑棋先行。点击空位落子，横、竖或斜向连成五子即可获胜。自由规则，无禁手。</p>';
  }
  function chessLines() {
    var lines = '';
    for (var r = 0; r < 10; r++) lines += '<path d="M .5 ' + (r + .5) + ' H 8.5"/>';
    for (var c = 0; c < 9; c++) lines += '<path d="M ' + (c + .5) + ' .5 V ' + (c === 0 || c === 8 ? '9.5' : '4.5 M ' + (c + .5) + ' 5.5 V 9.5') + '"/>';
    lines += '<path d="M 3.5 .5 L 5.5 2.5 M 5.5 .5 L 3.5 2.5 M 3.5 7.5 L 5.5 9.5 M 5.5 7.5 L 3.5 9.5"/>';
    return '<svg class="chess-lines" viewBox="0 0 9 10" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="#825f39" stroke-width=".025">' + lines + '</g><text x="2" y="5.14" text-anchor="middle">楚 河</text><text x="6.8" y="5.14" text-anchor="middle">汉 界</text></svg>';
  }
  function chessView() {
    var session = sessions.chess;
    return controls('chess') + status(boardStatus('chess', session)) + '<div class="chess-board" role="group" aria-label="中国象棋棋盘，红方在下">' + chessLines() + session.board.map(function (piece, at) {
      var legal = chessSelected !== null && rules.chess.legal(session.board, chessSelected, at, session.turn);
      return '<button type="button" class="chess-cell' + (chessSelected === at ? ' is-selected' : '') + (session.last && session.last.to === at ? ' is-last' : '') + '" data-chess-cell="' + at + '" aria-label="第' + (Math.floor(at / 9) + 1) + '行第' + (at % 9 + 1) + '列，' + (piece ? sideName(piece[0], 'chess') + names[piece] : '空位') + '"' + (session.winner || modes.chess === 'ai' && session.turn === 'b' ? ' disabled' : '') + '>' + (piece ? '<span class="chess-piece side-' + piece[0] + '">' + names[piece] + '</span>' : '') + (legal ? '<span class="chess-move-dot"></span>' : '') + '</button>';
    }).join('') + '</div><details class="game-help"><summary>走子说明与休闲规则</summary><p>先选己方棋子，再点击目标位置，圆点表示可走位置。支持蹩马腿、塞象眼、炮隔子吃子与将帅照面检查；不能走使己方被将军的棋。无合法走法时判负。</p><p>红方先走；人机模式你执红方。三次相同局面，或连续 60 回合未吃子，按和棋处理；此休闲版本不作竞赛级长将长捉裁定。</p></details>';
  }
  function playingCard(id, selectable, order) {
    var red = id < 52 && (id % 4 === 1 || id % 4 === 3) || id === 53;
    var rank = rules.landlord.rank(id), suit = id >= 52 ? '★' : ['♠', '♥', '♣', '♦'][id % 4];
    var value = id >= 52 ? id === 52 ? '小王' : '大王' : ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' }[rank] || rank);
    return '<button type="button" aria-label="' + escape(rules.landlord.label(id)) + '" class="playing-card' + (red ? ' card-red' : '') + (id >= 52 ? ' card-joker' : '') + (selectedCards.has(id) && selectable ? ' is-selected' : '') + '" style="--card-order:' + (Number(order) || 0) + '"' + (selectable ? ' data-card="' + id + '" aria-pressed="' + selectedCards.has(id) + '"' : ' disabled') + '><span class="card-corner"><b>' + value + '</b><i>' + suit + '</i></span><span class="card-face" aria-hidden="true">' + suit + '</span><span class="card-corner card-corner-bottom" aria-hidden="true"><b>' + value + '</b><i>' + suit + '</i></span></button>';
  }
  function seatName(seat) { return seat === 0 ? '你' : '电脑 ' + seat; }
  function avatar(seat) {
    var coat = ['#6089dc', '#e0a34d', '#b77eaf'][seat], hair = seat === 2 ? '#533d55' : '#493b35';
    return '<svg class="player-avatar" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="39" fill="' + ['#d2e5ff', '#ffe5b5', '#f2d5ee'][seat] + '"/><path d="M9 79c2-19 17-25 31-25s29 6 31 25" fill="' + coat + '"/><path d="M32 51h16v14l-8 7-8-7" fill="#edb28e"/><ellipse cx="40" cy="34" rx="24" ry="27" fill="' + hair + '"/><ellipse cx="40" cy="38" rx="21" ry="23" fill="#ffd1aa"/><path d="' + (seat === 2 ? 'M18 36C12 12 28 6 41 9c20-2 29 16 22 31-3-9-11-12-17-22-6 11-16 16-28 18' : 'M18 31C13 14 24 7 37 9c12-9 33 1 27 27-6-3-9-11-14-17-4 12-18 17-32 12') + '" fill="' + hair + '"/><path d="M28 35h7m10 0h7" stroke="' + hair + '" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="32" cy="40" rx="2" ry="3" fill="#3c3340"/><ellipse cx="48" cy="40" rx="2" ry="3" fill="#3c3340"/><path d="M34 50q6 7 12 0" fill="white" stroke="#b96a60" stroke-width="1.5"/><circle cx="25" cy="47" r="4" fill="#ef9d8c" opacity=".45"/><circle cx="55" cy="47" r="4" fill="#ef9d8c" opacity=".45"/><path d="M24 63l10 15 6-8 6 8 10-15" fill="#ffffffbc"/></svg>';
  }
  function seatRole(game, seat) { return game.landlord === null ? '等待叫分' : game.landlord === seat ? '地主' : '农民'; }
  function seatPortrait(game, seat) {
    return '<div class="player-portrait' + (game.landlord === seat ? ' is-landlord' : '') + '">' + avatar(seat) + (game.landlord === seat ? '<span class="landlord-crown" aria-label="地主">♛</span>' : '') + '</div>';
  }
  function landlordView() {
    var game = sessions.landlord, humanTurn = game.turn === 0, text;
    if (game.phase === 'over') text = (game.winner === game.landlord ? '地主获胜' : '农民获胜') + ' · ' + ((game.winner === game.landlord) === (game.landlord === 0) ? '你赢了！' : '本局电脑方获胜。');
    else if (game.phase === 'bid') text = humanTurn ? '轮到你叫分，或选择不叫。' : seatName(game.turn) + '正在叫分…';
    else if (game.phase === 'redeal') text = '无人叫地主，点击重新发牌。';
    else text = seatName(game.turn) + '出牌' + (humanTurn ? ' · 点击手牌选择，再点击出牌。' : ' · 电脑思考中…');
    var actions = '';
    if (game.phase === 'bid') {
      [1, 2, 3].forEach(function (value) { actions += button('bid', '叫 ' + value + ' 分', !humanTurn || value <= game.maxBid, ' data-bid="' + value + '"'); });
      actions += button('bid', '不叫', !humanTurn, ' data-bid="0"');
    }
    if (game.phase === 'play') actions += button('pass', '不出', !humanTurn || !game.last) + button('hint', '提示', !humanTurn) + button('play', '出牌', !humanTurn) + button('clear', '取消选择', !selectedCards.size);
    if (game.phase === 'over' || game.phase === 'redeal') actions += button('restart', '再来一局');
    var ownPlay = game.plays[0], won = game.phase === 'over' && ((game.winner === game.landlord) === (game.landlord === 0));
    return '<div class="landlord-room-head"><span><i class="game-online-dot"></i>经典三人 · 人机练习</span>' + button('restart', '重新发牌') + '</div><div class="landlord-table' + (game.phase === 'over' ? ' is-finished' : '') + '"><div class="table-felt" aria-hidden="true"><span>轻松一局</span><small>LOCAL CARD CLUB</small></div><div class="landlord-reserve"><span>底牌' + (game.landlord === null ? ' · 叫分后揭晓' : ' · ' + seatName(game.landlord) + '是地主') + '</span><div>' + (game.landlord === null ? '<span class="card-back" aria-hidden="true"></span>'.repeat(3) : game.reserve.map(function (id) { return playingCard(id, false); }).join('')) + '</div></div><div class="landlord-opponents">' + [1, 2].map(function (seat) {
      var play = game.plays[seat];
      return '<section class="landlord-seat seat-' + seat + (game.turn === seat && game.phase !== 'over' ? ' is-turn' : '') + '"><div class="seat-profile">' + seatPortrait(game, seat) + '<div><h4>' + seatName(seat) + '</h4><span class="seat-role">' + seatRole(game, seat) + '</span><p><span class="mini-card-back" aria-hidden="true"></span>剩余 <b>' + game.hands[seat].length + '</b> 张</p></div></div><div class="landlord-play">' + (play ? play.length ? play.map(function (id) { return playingCard(id, false); }).join('') : '<span class="pass-bubble">不出</span>' : '<span class="seat-wait">' + (game.phase === 'bid' ? '等候叫分' : '等候出牌') + '</span>') + '</div></section>';
    }).join('') + '</div><div class="landlord-my-play" aria-label="你最近出的牌">' + (ownPlay && ownPlay.length ? ownPlay.map(function (id) { return playingCard(id, false); }).join('') : '') + '</div><div class="landlord-turn-message' + (game.phase === 'over' ? ' is-result' : '') + '">' + (game.phase === 'over' ? '<span class="game-result-mark" aria-hidden="true">' + (won ? '✦' : '♠') + '</span>' : '') + status(text) + '</div><div class="game-controls landlord-actions">' + actions + '</div><div class="landlord-human"><div class="human-profile">' + seatPortrait(game, 0) + '<div><h4>你的手牌' + (game.landlord === 0 ? ' · 地主' : game.landlord !== null ? ' · 农民' : '') + '（' + game.hands[0].length + ' 张）</h4><span>' + (selectedCards.size ? '已选择 ' + selectedCards.size + ' 张' : humanTurn && game.phase === 'play' ? '点击手牌，向上选中' : '好牌在手，轻松开局') + '</span></div></div><div class="landlord-hand" style="--hand-count:' + Math.max(1, game.hands[0].length) + '">' + game.hands[0].map(function (id, index) { return playingCard(id, humanTurn && game.phase === 'play', index); }).join('') + '</div></div></div><details class="landlord-log"><summary>本局出牌记录</summary><div aria-label="最近出牌记录">' + game.log.slice(-5).map(function (line) { return '<p>' + escape(line) + '</p>'; }).join('') + '</div></details><details class="game-help"><summary>玩法与牌型说明</summary><p>54 张牌，每人 17 张，地主另得 3 张底牌。最高叫分者成为地主，无人叫分则重新发牌。地主独立对抗两位农民，任一方先出完获胜。</p><p>支持单张、对子、三张、三带一／对、顺子、连对、飞机及带单／对翅膀、四带二、炸弹和王炸。顺子、连对、飞机不能包含 2 和大小王。飞机单翅允许带对子，四带二单张允许带一对。相同牌型需张数一致且主牌更大；炸弹可压普通牌，王炸最大。连续两人不出后，上一位出牌者重新领出。</p><p>纯本地休闲练习，无金钱、下注、积分或联网匹配。</p></details>';
  }
  function reversiView() {
    var session = sessions.reversi, legal = rules.reversi.moves(session.board, session.turn);
    var black = session.board.filter(function (s) { return s === 1; }).length, white = session.board.filter(function (s) { return s === 2; }).length;
    return controls('reversi') + status(boardStatus('reversi', session)) + '<div class="reversi-score"><span>● 黑棋 <b>' + black + '</b></span><span>○ 白棋 <b>' + white + '</b></span></div>' + (session.passed && !session.winner ? '<p class="game-pass-note">' + sideName(session.passed, 'reversi') + '无合法落点，自动让行。</p>' : '') + '<div class="reversi-board" role="group" aria-label="八路黑白棋棋盘">' + session.board.map(function (stone, at) {
      return '<button type="button" class="reversi-cell' + (session.last === at ? ' is-last' : '') + '" data-reversi-cell="' + at + '" aria-label="第' + (Math.floor(at / 8) + 1) + '行第' + (at % 8 + 1) + '列，' + (stone ? sideName(stone, 'reversi') : legal.includes(at) ? '可落子' : '空位') + '"' + (session.winner || !legal.includes(at) || modes.reversi === 'ai' && session.turn === 2 ? ' disabled' : '') + '>' + (stone ? '<span class="gomoku-stone stone-' + stone + '"></span>' : legal.includes(at) ? '<span class="reversi-move-dot"></span>' : '') + '</button>';
    }).join('') + '</div><details class="game-help"><summary>黑白棋规则</summary><p>黑棋先行。落子必须在横、竖或斜线夹住至少一枚对方棋子，被夹住的棋子全部翻转。圆点提示合法落点。无棋可下时自动让行，双方都无棋可下时按棋子数判胜，数量相同为和棋。</p></details>';
  }
  function mahjongTile(tile, index, enabled) {
    var label = rules.mahjong.label(tile), suit = Math.floor(tile / 9);
    return '<button type="button" class="mahjong-tile tile-suit-' + suit + (index === mahjongSelected && enabled ? ' is-selected' : '') + '" aria-label="' + label + '"' + (enabled ? ' data-mahjong-tile="' + index + '" aria-pressed="' + (index === mahjongSelected) + '"' : ' disabled') + '><b>' + label[0] + '</b><span>' + label[1] + '</span></button>';
  }
  function mahjongMelds(game, seat) {
    return '<div class="mahjong-melds">' + game.melds[seat].map(function (meld) { var hidden = meld.concealed && seat !== 0; return '<span class="mahjong-meld" aria-label="' + (hidden ? '暗杠（牌面隐藏）' : (meld.count === 4 ? meld.concealed ? '暗杠' : '明杠' : '碰') + rules.mahjong.label(meld.tile)) + '">' + (hidden ? '<span class="mahjong-back"></span>'.repeat(meld.count) : Array.from({ length: meld.count }, function () { return mahjongTile(meld.tile, -1, false); }).join('')) + '</span>'; }).join('') + '</div>';
  }
  function mahjongView() {
    var game = sessions.mahjong, human = game.turn === 0, options = rules.mahjong.options(game, 0), text, actions = '';
    if (game.phase === 'over') text = game.winner === 'draw' ? '牌墙已空，本局流局。' : (game.winner === 0 ? '你胡牌了！' : '电脑 ' + game.winner + '胡牌') + (game.result.type === 'self' ? ' · 自摸' : ' · ' + seatName(game.result.from) + '点炮');
    else if (game.phase === 'claim') text = human ? '可响应' + seatName(game.pending.from) + '打出的' + rules.mahjong.label(game.pending.tile) + '，选择操作或跳过。' : seatName(game.turn) + '正在响应弃牌…';
    else text = human ? '轮到你出牌 · 点击手牌选择，再点击“打出”。' : seatName(game.turn) + '思考中…';
    if (human && game.phase === 'claim') {
      game.pending.actions.forEach(function (action) { actions += button('mahjong-claim', { win: '胡牌', kong: '明杠', pung: '碰牌' }[action], false, ' data-claim="' + action + '"'); });
      actions += button('mahjong-claim', '跳过', false, ' data-claim="pass"');
    } else if (game.phase === 'discard') {
      actions += button('mahjong-discard', '打出', !human || mahjongSelected === null) + button('mahjong-hint', '理牌提示', !human);
      if (human && options.win) actions += button('mahjong-win', '自摸胡牌');
      if (human) options.kongs.forEach(function (tile) { actions += button('mahjong-kong', '暗杠' + rules.mahjong.label(tile), false, ' data-tile="' + tile + '"'); });
    } else if (game.phase === 'over') actions += button('restart', '再来一局');
    return '<div class="mahjong-room"><div class="mahjong-room-top"><span>三门无字 · 四人休闲</span><span>牌墙剩余 <b>' + game.wall.length + '</b> 张</span>' + button('restart', '重新发牌') + '</div><div class="mahjong-table">' + [1, 2, 3].map(function (seat) {
      return '<section class="mahjong-seat mahjong-seat-' + seat + (game.turn === seat && game.phase !== 'over' ? ' is-turn' : '') + '"><div class="seat-profile"><div class="player-portrait">' + avatar(seat % 3) + '</div><div><h4>电脑 ' + seat + '</h4><span class="seat-role">' + ['东 · 庄家', '南家', '西家', '北家'][seat] + '</span><p>手牌 ' + game.hands[seat].length + ' 张</p></div></div><div class="mahjong-opponent-backs" aria-hidden="true">' + '<span class="mahjong-back"></span>'.repeat(Math.min(5, game.hands[seat].length)) + '</div>' + mahjongMelds(game, seat) + '</section>';
    }).join('') + '<div class="mahjong-center"><span>清雅一桌</span>' + (game.lastDiscard ? '<small>' + seatName(game.lastDiscard.seat) + '最近打出</small>' + mahjongTile(game.lastDiscard.tile, -1, false) : '<small>碰杠自摸 · 轻松开局</small>') + '</div></div>' + status(text) + '<div class="game-controls mahjong-actions">' + actions + '</div><div class="mahjong-human"><h4>你的手牌 · 东家' + (game.phase === 'discard' && human && game.lastDraw !== null ? ' · 刚摸入' + rules.mahjong.label(game.lastDraw) : '') + '</h4>' + mahjongMelds(game, 0) + '<div class="mahjong-hand">' + game.hands[0].map(function (tile, index) { return mahjongTile(tile, index, human && game.phase === 'discard'); }).join('') + '</div></div>' + (game.phase === 'over' && game.winner !== 'draw' && game.winner !== 0 ? '<div class="mahjong-winning-hand"><h4>胡牌方手牌</h4><div class="mahjong-hand">' + game.hands[game.winner].map(function (tile) { return mahjongTile(tile, -1, false); }).join('') + '</div></div>' : '') + '<details class="mahjong-discards"><summary>各家弃牌</summary>' + game.discards.map(function (tiles, seat) { return '<div><strong>' + seatName(seat) + '</strong><div class="mahjong-discard-row">' + tiles.map(function (tile) { return mahjongTile(tile, -1, false); }).join('') + '</div></div>'; }).join('') + '</details><details class="landlord-log"><summary>本局记录</summary>' + game.log.map(function (line) { return '<p>' + escape(line) + '</p>'; }).join('') + '</details><details class="game-help"><summary>麻将规则（休闲版）</summary><p>108 张万、筒、条，四人对局，你为东家庄家。庄家 14 张先出牌，其余各 13 张。点击选牌后“打出”。支持碰、明杠、暗杠与杠后补牌，不吃牌、不加杠、不抢杠，不计番。</p><p>胡牌为四组顺子／刻子加一对将，或未副露时七对（四张相同牌算两对）。可自摸或点炮胡，胡牌优先于碰杠；多家可胡时按出牌者之后的顺序，先响应者胜，不设一炮多响。牌墙耗尽流局。</p><p>“理牌提示”只建议一张弃牌；不是听牌或胡牌保证。三位电脑仅按各自手牌作决定，不读取你的暗牌。无金钱、下注或联网匹配。</p></details></div>';
  }
  function gameView() { return { landlord: landlordView, mahjong: mahjongView, chess: chessView, gomoku: gomokuView, reversi: reversiView }[current](); }
  function gameSubtitle(game) { return { landlord: '经典三人 · 欢乐开局', mahjong: '四人牌桌 · 碰杠自摸', chess: '楚河汉界 · 运筹帷幄', gomoku: '黑白交锋 · 五子连珠', reversi: '落子翻转 · 占角争先' }[game]; }
  function render() {
    if (!root) return;
    var focus = document.activeElement, locator = focus && root.contains(focus) ? ['data-gomoku-cell', 'data-chess-cell', 'data-reversi-cell', 'data-mahjong-tile', 'data-card'].find(function (key) { return focus.hasAttribute(key); }) : null;
    var focusValue = locator ? focus.getAttribute(locator) : null;
    root.innerHTML = '<div class="entertainment-head"><div><span class="game-eyebrow">TAKE A LITTLE BREAK</span><h2>休闲棋牌室<span aria-hidden="true">♠</span></h2><p>把研究放一放，让快乐先出牌。</p></div><span class="game-local-badge"><i class="game-online-dot"></i>本地畅玩 · 无需联网</span></div><div class="game-tabs" role="tablist" aria-label="选择游戏">' + Object.keys(titles).map(function (game) { return '<button type="button" role="tab" aria-label="' + titles[game] + '" aria-selected="' + (game === current) + '" data-game-tab="' + game + '" class="' + (game === current ? 'is-active ' : '') + 'game-tab-' + game + '"><span class="game-tab-icon" aria-hidden="true">' + ({ landlord: '♠', mahjong: '發', chess: '将', gomoku: '●', reversi: '◐' }[game]) + '</span><span><b>' + titles[game] + '</b><small>' + gameSubtitle(game) + '</small></span><span class="game-tab-arrow" aria-hidden="true">↗</span></button>'; }).join('') + '</div><section class="game-stage game-stage-' + current + '" aria-label="' + titles[current] + '"><div class="game-stage-title"><h3>' + titles[current] + '</h3><span>' + (current === 'landlord' ? 'CLASSIC · 3 PLAYERS' : current === 'mahjong' ? 'MAHJONG · 4 PLAYERS' : 'BOARD GAME · RELAX & PLAY') + '</span></div>' + gameView() + '<p class="game-notice" role="status" aria-live="polite">' + escape(notice) + '</p></section><p class="game-storage-note">休闲有度，研究有序。对局仅在当前页面保留；切换模块可继续，刷新后重新开局，不上传云端。</p>';
    if (locator) { var nextFocus = root.querySelector('[' + locator + '="' + focusValue + '"]'); if (nextFocus && !nextFocus.disabled) nextFocus.focus({ preventScroll: true }); }
    scheduleAI();
  }
  function boardMove(game, from, to) {
    var session = sessions[game];
    if (session.winner) return false;
    if (game === 'reversi') {
      var changed = rules.reversi.move(session.board, to, session.turn); if (!changed) return false;
      session.history.push({ board: session.board, turn: session.turn, last: session.last, winner: session.winner, passed: session.passed });
      session.board = changed.board; session.turn = changed.turn; session.winner = changed.winner; session.passed = changed.passed; session.last = to;
    } else if (game === 'gomoku') {
      var result = rules.gomoku.move(session.board, to, session.turn);
      if (!result) return false;
      session.history.push({ board: session.board, turn: session.turn, last: session.last, winner: session.winner });
      session.board = result.board; session.winner = result.winner; session.turn = 3 - session.turn; session.last = to;
    } else {
      if (!rules.chess.legal(session.board, from, to, session.turn)) return false;
      session.history.push({ board: session.board, turn: session.turn, last: session.last, quiet: session.quiet, positions: session.positions.slice(), winner: session.winner });
      session.quiet = session.board[to] ? 0 : session.quiet + 1;
      session.board = rules.chess.apply(session.board, { from: from, to: to });
      var mover = session.turn; session.turn = mover === 'r' ? 'b' : 'r'; session.last = { from: from, to: to }; chessSelected = null;
      var key = session.board.join(',') + ':' + session.turn; session.positions.push(key);
      if (!rules.chess.moves(session.board, session.turn).length) session.winner = mover;
      else if (session.quiet >= 120 || session.positions.filter(function (value) { return value === key; }).length >= 3) session.winner = 'draw';
    }
    notice = ''; return true;
  }
  function cardPlay(cards) {
    var game = sessions.landlord, seat = game.turn;
    if (!rules.landlord.play(game, seat, cards)) { notice = '所选牌型无效或不能压过上一手，请重新选择或使用提示。'; return false; }
    game.log.push(seatName(seat) + (cards.length ? '：' + rules.landlord.sort(cards).map(rules.landlord.label).join(' ') : '：不出'));
    game.log = game.log.slice(-20); selectedCards.clear(); notice = ''; return true;
  }
  function makeBid(value) {
    var game = sessions.landlord, seat = game.turn;
    if (rules.landlord.bid(game, seat, value)) game.log.push(seatName(seat) + (value ? '叫 ' + value + ' 分' : '不叫'));
  }
  function scheduleAI() {
    if (!active || document.hidden || timer !== null) return;
    var session = sessions[current], game = current, token = epoch;
    var needed = game === 'landlord' ? (session.phase === 'bid' || session.phase === 'play') && session.turn !== 0 : game === 'mahjong' ? session.phase !== 'over' && session.turn !== 0 : modes[game] === 'ai' && !session.winner && (session.turn === 'b' || session.turn === 2);
    if (!needed) return;
    timer = setTimeout(function () {
      timer = null;
      if (token !== epoch || !active || current !== game || document.hidden || sessions[game] !== session) return;
      try {
        if (game === 'landlord') { if (session.phase === 'bid') makeBid(rules.landlord.bidAI(session, session.turn)); else cardPlay(rules.landlord.ai(session, session.turn)); }
        else if (game === 'mahjong') { rules.mahjong.ai(session); mahjongSelected = null; }
        else if (game === 'gomoku' || game === 'reversi') {
          var candidates = game === 'reversi' ? rules.reversi.moves(session.board, 2) : session.board.map(function (_, at) { return at; }).filter(function (at) { return !session.board[at]; });
          var at = difficulties[game] === 'easy' ? candidates[Math.floor(Math.random() * candidates.length)] : rules[game].ai(session.board, 2);
          if (Number.isInteger(at) && at >= 0) boardMove(game, null, at);
        } else { var moves = difficulties.chess === 'easy' ? rules.chess.moves(session.board, 'b') : null; var move = moves ? moves[Math.floor(Math.random() * moves.length)] : rules.chess.ai(session.board, 'b'); if (move) boardMove(game, move.from, move.to); }
        render();
      } catch (_) { notice = '本局电脑走子遇到问题，请重新开局。'; renderError(); }
    }, game === 'landlord' || game === 'mahjong' ? 650 : 380);
  }
  function renderError() { var message = root.querySelector('.game-notice'); if (message) message.textContent = notice; }
  function undo() {
    var session = sessions[current]; if (!session.history || !session.history.length) return;
    cancelAI();
    do { var previous = session.history.pop(); Object.keys(previous).forEach(function (key) { session[key] = previous[key]; }); }
    while (modes[current] === 'ai' && session.history.length && (session.turn === 'b' || session.turn === 2));
    chessSelected = null; notice = '已悔棋。';
  }
  function bind() {
    root.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-game-tab]');
      if (tab && titles[tab.dataset.gameTab]) { cancelAI(); current = tab.dataset.gameTab; chessSelected = null; mahjongSelected = null; notice = ''; render(); return; }
      var action = event.target.closest('[data-game-action]');
      if (action && !action.disabled) {
        if (action.dataset.gameAction === 'restart') reset(current);
        if (action.dataset.gameAction === 'undo') undo();
        if (current === 'mahjong') {
          var mahjong = sessions.mahjong, kind = action.dataset.gameAction;
          if (mahjong.turn === 0) {
            if (kind === 'mahjong-discard' && mahjongSelected !== null) { rules.mahjong.discard(mahjong, 0, mahjong.hands[0][mahjongSelected]); mahjongSelected = null; notice = ''; }
            if (kind === 'mahjong-hint' && mahjong.phase === 'discard') { mahjongSelected = mahjong.hands[0].indexOf(rules.mahjong.hint(mahjong, 0)); notice = '已选择建议弃牌，可调整后点击“打出”。'; }
            if (kind === 'mahjong-claim') { rules.mahjong.claim(mahjong, 0, action.dataset.claim); mahjongSelected = null; notice = ''; }
            if (kind === 'mahjong-win') rules.mahjong.win(mahjong, 0);
            if (kind === 'mahjong-kong') { rules.mahjong.kong(mahjong, 0, Number(action.dataset.tile)); mahjongSelected = null; }
          }
        }
        if (current === 'landlord') {
          var game = sessions.landlord;
          if (action.dataset.gameAction === 'bid' && game.turn === 0) makeBid(Number(action.dataset.bid));
          if (action.dataset.gameAction === 'play' && game.turn === 0) { if (selectedCards.size) cardPlay(Array.from(selectedCards)); else notice = '请先选择要出的手牌。'; }
          if (action.dataset.gameAction === 'pass' && game.turn === 0) cardPlay([]);
          if (action.dataset.gameAction === 'clear') selectedCards.clear();
          if (action.dataset.gameAction === 'hint' && game.turn === 0) { selectedCards = new Set(rules.landlord.ai(game, 0, true)); notice = selectedCards.size ? '已选出一组可出的牌，可调整后点击“出牌”。' : '没有可压牌，可以选择“不出”。'; }
        }
        render(); return;
      }
      var card = event.target.closest('[data-card]');
      if (card && !card.disabled) { var id = Number(card.dataset.card); if (selectedCards.has(id)) selectedCards.delete(id); else selectedCards.add(id); render(); return; }
      var tile = event.target.closest('[data-mahjong-tile]');
      if (tile && !tile.disabled && current === 'mahjong' && sessions.mahjong.turn === 0 && sessions.mahjong.phase === 'discard') { var index = Number(tile.dataset.mahjongTile); mahjongSelected = mahjongSelected === index ? null : index; render(); return; }
      var reversi = event.target.closest('[data-reversi-cell]');
      if (reversi && !reversi.disabled) { boardMove('reversi', null, Number(reversi.dataset.reversiCell)); render(); return; }
      var stone = event.target.closest('[data-gomoku-cell]');
      if (stone && !stone.disabled) { boardMove('gomoku', null, Number(stone.dataset.gomokuCell)); render(); return; }
      var square = event.target.closest('[data-chess-cell]');
      if (square && !square.disabled) {
        var at = Number(square.dataset.chessCell), session = sessions.chess;
        if (session.board[at] && session.board[at][0] === session.turn) chessSelected = chessSelected === at ? null : at;
        else if (chessSelected !== null && !boardMove('chess', chessSelected, at)) notice = '这里不能落子，请选择圆点标记的位置。';
        render();
      }
    });
    root.addEventListener('change', function (event) {
      if (!Object.prototype.hasOwnProperty.call(modes, current)) return;
      if (event.target.id === 'entertainmentMode' && ['ai', 'local'].includes(event.target.value)) { modes[current] = event.target.value; reset(current); render(); }
      if (event.target.id === 'entertainmentDifficulty' && ['easy', 'normal'].includes(event.target.value)) { difficulties[current] = event.target.value; notice = '电脑难度已更新，下次电脑行动时生效。'; render(); }
    });
    root.addEventListener('keydown', function (event) {
      var cell = event.target.closest('[data-chess-cell],[data-gomoku-cell],[data-reversi-cell]'), shifts = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 };
      if (!cell || !Object.prototype.hasOwnProperty.call(shifts, event.key)) return;
      event.preventDefault();
      var chess = cell.hasAttribute('data-chess-cell'), reversi = cell.hasAttribute('data-reversi-cell'), attr = chess ? 'data-chess-cell' : reversi ? 'data-reversi-cell' : 'data-gomoku-cell', width = chess ? 9 : reversi ? 8 : 15, index = Number(cell.getAttribute(attr));
      var next = index + shifts[event.key] * (event.key === 'ArrowUp' || event.key === 'ArrowDown' ? width : 1);
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && Math.floor(index / width) !== Math.floor(next / width)) return;
      var target = root.querySelector('[' + attr + '="' + next + '"]'); if (target && !target.disabled) target.focus();
    });
  }
  function mount() {
    if (root || !rules) return;
    root = document.getElementById('entertainmentRoot'); if (!root) return;
    Object.keys(titles).forEach(reset); bind();
    active = document.getElementById('panel-entertainment').classList.contains('active'); render();
    document.addEventListener('visibilitychange', function () { if (document.hidden) cancelAI(); else scheduleAI(); });
  }
  window.AcademicEntertainment = { panelChanged: function (panel) { mount(); active = panel === 'entertainment'; if (!active) cancelAI(); else scheduleAI(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
}());
