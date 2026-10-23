(function () {
  'use strict';
  var rules = window.AcademicGames, root = null, current = 'landlord', active = false, timer = null, epoch = 0, notice = '';
  var modes = { chess: 'ai', gomoku: 'ai' }, sessions = {}, selectedCards = new Set(), chessSelected = null;
  var titles = { landlord: '斗地主', chess: '中国象棋', gomoku: '五子棋' };
  var names = { rK: '帅', rA: '仕', rE: '相', rH: '马', rR: '车', rC: '炮', rP: '兵', bK: '将', bA: '士', bE: '象', bH: '马', bR: '车', bC: '炮', bP: '卒' };
  function escape(value) { return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cancelAI() { if (timer !== null) clearTimeout(timer); timer = null; epoch++; }
  function reset(game) {
    cancelAI(); notice = ''; chessSelected = null; selectedCards.clear();
    if (game === 'landlord') { sessions[game] = rules.landlord.create(); sessions[game].log = ['已发牌：你先叫分，最高分者成为地主。']; }
    if (game === 'gomoku') sessions[game] = { board: Array(225).fill(0), turn: 1, winner: null, history: [], last: null };
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
    return '<div class="game-controls"><label>对弈模式 <select id="entertainmentMode" aria-label="对弈模式"><option value="ai"' + (modes[game] === 'ai' ? ' selected' : '') + '>人机对弈</option><option value="local"' + (modes[game] === 'local' ? ' selected' : '') + '>本机双人</option></select></label>' + button('restart', '重新开局') + button('undo', modes[game] === 'ai' ? '悔棋一轮' : '悔棋一步', !session.history.length) + '</div>';
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
  function playingCard(id, selectable) {
    var red = id < 52 && (id % 4 === 1 || id % 4 === 3) || id === 53;
    return '<button type="button" class="playing-card' + (red ? ' card-red' : '') + (selectedCards.has(id) && selectable ? ' is-selected' : '') + '"' + (selectable ? ' data-card="' + id + '" aria-pressed="' + selectedCards.has(id) + '"' : ' disabled') + '>' + escape(rules.landlord.label(id)) + '</button>';
  }
  function seatName(seat) { return seat === 0 ? '你' : '电脑 ' + seat; }
  function landlordView() {
    var game = sessions.landlord, humanTurn = game.turn === 0, text;
    if (game.phase === 'over') text = (game.winner === game.landlord ? '地主获胜' : '农民获胜') + ' · ' + ((game.winner === game.landlord) === (game.landlord === 0) ? '你赢了！' : '本局电脑方获胜。');
    else if (game.phase === 'bid') text = humanTurn ? '轮到你叫分，或选择不叫。' : seatName(game.turn) + '正在叫分…';
    else if (game.phase === 'redeal') text = '无人叫地主，点击重新发牌。';
    else text = seatName(game.turn) + '出牌' + (humanTurn ? ' · 点击手牌选择，再点击出牌。' : ' · 电脑思考中…');
    var actions = button('restart', '重新发牌');
    if (game.phase === 'bid') {
      [1, 2, 3].forEach(function (value) { actions += button('bid', '叫 ' + value + ' 分', !humanTurn || value <= game.maxBid, ' data-bid="' + value + '"'); });
      actions += button('bid', '不叫', !humanTurn, ' data-bid="0"');
    }
    if (game.phase === 'play') actions += button('play', '出牌', !humanTurn) + button('pass', '不出', !humanTurn || !game.last) + button('hint', '提示', !humanTurn) + button('clear', '取消选择', !selectedCards.size);
    return '<div class="game-controls">' + actions + '</div>' + status(text) + '<div class="landlord-table"><div class="landlord-reserve"><span>底牌' + (game.landlord === null ? '（叫分后揭晓）' : ' · ' + seatName(game.landlord) + '是地主') + '</span><div>' + (game.landlord === null ? '<span class="card-back">?</span>'.repeat(3) : game.reserve.map(function (id) { return playingCard(id, false); }).join('')) + '</div></div><div class="landlord-opponents">' + [1, 2].map(function (seat) {
      var play = game.plays[seat];
      return '<section class="landlord-seat' + (game.turn === seat && game.phase !== 'over' ? ' is-turn' : '') + '"><h4>' + seatName(seat) + (game.landlord === seat ? ' · 地主' : game.landlord !== null ? ' · 农民' : '') + '</h4><p>剩余 ' + game.hands[seat].length + ' 张</p><div class="landlord-play">' + (play ? play.length ? play.map(function (id) { return playingCard(id, false); }).join('') : '<span>不出</span>' : '<span>等待出牌</span>') + '</div></section>';
    }).join('') + '</div><div class="landlord-human"><h4>你的手牌' + (game.landlord === 0 ? ' · 地主' : game.landlord !== null ? ' · 农民' : '') + '（' + game.hands[0].length + ' 张）</h4><div class="landlord-hand">' + game.hands[0].map(function (id) { return playingCard(id, humanTurn && game.phase === 'play'); }).join('') + '</div></div><div class="landlord-log" aria-label="最近出牌记录">' + game.log.slice(-5).map(function (line) { return '<p>' + escape(line) + '</p>'; }).join('') + '</div></div><details class="game-help"><summary>支持的牌型与规则</summary><p>54 张牌，每人 17 张，地主另得 3 张底牌。最高叫分者成为地主，无人叫分则重新发牌。地主独立对抗两位农民，任一方先出完获胜。</p><p>支持单张、对子、三张、三带一／对、顺子、连对、飞机及带单／对翅膀、四带二、炸弹和王炸。顺子、连对、飞机不能包含 2 和大小王。飞机单翅允许带对子，四带二单张允许带一对。相同牌型需张数一致且主牌更大；炸弹可压普通牌，王炸最大。连续两人不出后，上一位出牌者重新领出。</p><p>休闲人机练习，无金钱、下注、积分或联网匹配。</p></details>';
  }
  function render() {
    if (!root) return;
    var focus = document.activeElement, locator = focus && root.contains(focus) ? ['data-gomoku-cell', 'data-chess-cell', 'data-card'].find(function (key) { return focus.hasAttribute(key); }) : null;
    var focusValue = locator ? focus.getAttribute(locator) : null;
    root.innerHTML = '<div class="entertainment-head"><div><h2>研究间隙，轻松一局</h2><p>纯本地休闲游戏，不读取论文、文献或其他学术资料。</p></div></div><div class="game-tabs" role="tablist" aria-label="选择游戏">' + Object.keys(titles).map(function (game) { return '<button type="button" role="tab" aria-selected="' + (game === current) + '" data-game-tab="' + game + '" class="' + (game === current ? 'is-active' : '') + '">' + titles[game] + '</button>'; }).join('') + '</div><section class="game-stage" aria-label="' + titles[current] + '"><h3>' + titles[current] + '</h3>' + (current === 'landlord' ? landlordView() : current === 'chess' ? chessView() : gomokuView()) + '<p class="game-notice" role="status" aria-live="polite">' + escape(notice) + '</p></section><p class="game-storage-note">对局在本次打开的页面中保留，切换模块不会丢失；刷新或关闭页面会重新开局。娱乐对局不上传云端。</p>';
    if (locator) { var nextFocus = root.querySelector('[' + locator + '="' + focusValue + '"]'); if (nextFocus && !nextFocus.disabled) nextFocus.focus({ preventScroll: true }); }
    scheduleAI();
  }
  function boardMove(game, from, to) {
    var session = sessions[game];
    if (session.winner) return false;
    if (game === 'gomoku') {
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
    var needed = game === 'landlord' ? (session.phase === 'bid' || session.phase === 'play') && session.turn !== 0 : modes[game] === 'ai' && !session.winner && (session.turn === 'b' || session.turn === 2);
    if (!needed) return;
    timer = setTimeout(function () {
      timer = null;
      if (token !== epoch || !active || current !== game || document.hidden || sessions[game] !== session) return;
      try {
        if (game === 'landlord') { if (session.phase === 'bid') makeBid(rules.landlord.bidAI(session, session.turn)); else cardPlay(rules.landlord.ai(session, session.turn)); }
        else if (game === 'gomoku') { var at = rules.gomoku.ai(session.board, 2); if (at >= 0) boardMove(game, null, at); }
        else { var move = rules.chess.ai(session.board, 'b'); if (move) boardMove(game, move.from, move.to); }
        render();
      } catch (_) { notice = '本局电脑走子遇到问题，请重新开局。'; renderError(); }
    }, game === 'landlord' ? 650 : 380);
  }
  function renderError() { var message = root.querySelector('.game-notice'); if (message) message.textContent = notice; }
  function undo() {
    var session = sessions[current]; if (current === 'landlord' || !session.history.length) return;
    cancelAI();
    do { var previous = session.history.pop(); Object.keys(previous).forEach(function (key) { session[key] = previous[key]; }); }
    while (modes[current] === 'ai' && session.history.length && (session.turn === 'b' || session.turn === 2));
    chessSelected = null; notice = '已悔棋。';
  }
  function bind() {
    root.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-game-tab]');
      if (tab) { cancelAI(); current = tab.dataset.gameTab; chessSelected = null; notice = ''; render(); return; }
      var action = event.target.closest('[data-game-action]');
      if (action && !action.disabled) {
        if (action.dataset.gameAction === 'restart') reset(current);
        if (action.dataset.gameAction === 'undo') undo();
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
    root.addEventListener('change', function (event) { if (event.target.id === 'entertainmentMode' && ['ai', 'local'].includes(event.target.value)) { modes[current] = event.target.value; reset(current); render(); } });
    root.addEventListener('keydown', function (event) {
      var cell = event.target.closest('[data-chess-cell],[data-gomoku-cell]'), shifts = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 };
      if (!cell || !Object.prototype.hasOwnProperty.call(shifts, event.key)) return;
      event.preventDefault();
      var chess = cell.hasAttribute('data-chess-cell'), attr = chess ? 'data-chess-cell' : 'data-gomoku-cell', width = chess ? 9 : 15, index = Number(cell.getAttribute(attr));
      var next = index + shifts[event.key] * (event.key === 'ArrowUp' || event.key === 'ArrowDown' ? width : 1);
      if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && Math.floor(index / width) !== Math.floor(next / width)) return;
      var target = root.querySelector('[' + attr + '="' + next + '"]'); if (target && !target.disabled) target.focus();
    });
  }
  function mount() {
    if (root || !rules) return;
    root = document.getElementById('entertainmentRoot'); if (!root) return;
    ['landlord', 'chess', 'gomoku'].forEach(reset); bind();
    active = document.getElementById('panel-entertainment').classList.contains('active'); render();
    document.addEventListener('visibilitychange', function () { if (document.hidden) cancelAI(); else scheduleAI(); });
  }
  window.AcademicEntertainment = { panelChanged: function (panel) { mount(); active = panel === 'entertainment'; if (!active) cancelAI(); else scheduleAI(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
}());
