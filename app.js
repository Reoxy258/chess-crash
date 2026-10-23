/* 十字连爆 · chess-crash — 交互、演出与进度
 *
 * 依赖：engine.js / solver.js / levels.js（全局 CC_*）
 *
 * 演出核心：消费 applyMove 的 trace，
 * 按波次播放「分裂爆炸 → 冲击光点沿行/列按距离飞行 → 到达 +1」，
 * 连锁波数驱动徽章、震屏与音高阶梯。提示免费；失败可看答案回放。
 */
(function () {
  'use strict';

  const E = window.CC_ENGINE;
  const S = window.CC_SOLVER;
  const LEVELS = window.CC_LEVELS;
  const CHAPTERS = window.CC_CHAPTERS;
  const starFor = window.CC_STAR_FOR;
  const unlocked = window.CC_UNLOCKED;

  const $ = id => document.getElementById(id);
  const menuScreen = $('screen-menu');
  const gameScreen = $('screen-game');
  const boardEl = $('board');
  const boardWrap = $('board-wrap');
  const chainBadge = $('chain-badge');
  const msgEl = $('msg');
  const bankNum = $('bank-num');
  const bankBadge = $('bank-badge');
  const overlay = $('overlay');
  const overlayBox = $('overlay-box');
  const coachEl = $('coach');
  const coachText = $('coach-text');

  const KEY = 'cc-progress-v1';
  const SPARK_UNIT = 55;   // 每格冲击波的飞行毫秒数
  const SPARK_BASE = 90;   // 光点基础飞行毫秒数

  let progress = loadProgress();
  let levelIdx = -1;
  let level = null;
  let game = null;
  let history = [];
  let busy = false;
  let maxChain = 0;
  let focusIdx = -1;
  let hintStage = 0;       // 提示层级：0 无 → 1 文案 → 2 高亮
  let hintTimer = 0;
  let coach2Shown = false;

  function loadProgress() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      if (v && typeof v === 'object' && v.stars) return v;
    } catch (e) { /* 损坏则重置 */ }
    return { stars: {} };
  }
  function saveProgress() {
    try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (e) { /* 隐私模式忽略 */ }
  }

  /* ================= 音效（WebAudio 合成，无素材） ================= */
  const sfx = (function () {
    let ctx = null;
    function ensure() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur, opts) {
      opts = opts || {};
      try {
        const c = ensure();
        const t0 = c.currentTime;
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = opts.type || 'sine';
        o.frequency.setValueAtTime(freq, t0);
        if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
        g.gain.setValueAtTime(opts.gain || 0.12, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        o.connect(g);
        g.connect(c.destination);
        o.start(t0);
        o.stop(t0 + dur);
      } catch (e) { /* 音频不可用则静默 */ }
    }
    return {
      unlock() { try { ensure(); } catch (e) { /* noop */ } },
      place() { tone(520, 0.09, { type: 'triangle' }); },
      plant() { tone(392, 0.14, { type: 'sine', slide: 560 }); },
      wave(n) { tone(277 * Math.pow(2, Math.min(n, 24) / 12), 0.2, { type: 'square', gain: 0.06 }); },
      hit() { tone(932, 0.05, { type: 'triangle', gain: 0.05 }); },
      boom() { tone(110, 0.32, { type: 'sawtooth', gain: 0.15, slide: 45 }); },
      win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.2, { type: 'triangle', gain: 0.1 }), i * 110)); },
      lose() { [330, 262, 208].forEach((f, i) => setTimeout(() => tone(f, 0.24, { type: 'sine', gain: 0.1 }), i * 140)); }
    };
  })();
  document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

  /* ================= 工具 ================= */
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function msg(text) {
    msgEl.textContent = text;
    msgEl.classList.remove('flash');
    void msgEl.offsetWidth;
    msgEl.classList.add('flash');
  }
  function cellEl(i) { return boardEl.children[i]; }
  function pieceEl(i) { return boardEl.children[i].querySelector('.piece'); }

  /* ================= 菜单 ================= */
  function totalStars() {
    let n = 0;
    for (const l of LEVELS) n += progress.stars[l.id] || 0;
    return n;
  }
  function renderMenu() {
    $('total-stars').textContent = '★ ' + totalStars() + ' / ' + LEVELS.length * 3;
    const host = $('chapters');
    host.innerHTML = '';
    for (let ch = 1; ch <= 6; ch++) {
      const list = LEVELS.map((l, i) => ({ l, i })).filter(x => x.l.chapter === ch);
      const chStars = list.reduce((n, x) => n + (progress.stars[x.l.id] || 0), 0);
      const wrap = document.createElement('div');
      wrap.className = 'chapter';
      const title = document.createElement('p');
      title.className = 'chapter-title';
      title.innerHTML = '<span>' + CHAPTERS[ch] + '</span><span class="ch-stars">★ ' + chStars + '/' + list.length * 3 + '</span>';
      wrap.appendChild(title);
      const row = document.createElement('div');
      row.className = 'level-row';
      for (const { l, i } of list) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const open = unlocked(LEVELS, i, progress.stars);
        const st = progress.stars[l.id] || 0;
        btn.className = 'level-btn' + (open ? '' : ' locked') + (st === 3 ? ' perfect' : '');
        if (open) {
          btn.innerHTML =
            '<div class="lv-no">' + l.id + '</div>' +
            '<span class="lv-name">' + l.title + '</span>' +
            '<div class="level-stars">' + starsHtml(st) + '</div>';
          btn.addEventListener('click', () => startLevel(i));
        } else {
          btn.innerHTML = '<div class="lock">🔒</div><div class="lv-no">' + l.id + '</div>';
        }
        row.appendChild(btn);
      }
      wrap.appendChild(row);
      host.appendChild(wrap);
    }
  }
  function starsHtml(n) {
    let s = '';
    for (let k = 1; k <= 3; k++) s += '<span class="' + (k <= n ? '' : 'off') + '">★</span>';
    return s;
  }

  /* ================= 棋盘渲染 ================= */
  function buildBoard() {
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = 'repeat(' + game.size + ', 1fr)';
    for (let i = 0; i < game.cells.length; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const v = game.cells[i];
      if (v > 0) {
        const p = document.createElement('div');
        p.className = 'piece p' + v;
        p.textContent = String(v);
        cell.appendChild(p);
      } else if (game.allowPlant) {
        cell.classList.add('plantable');
      }
      cell.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        onFocus(i);
        tryPlay(i);
      });
      boardEl.appendChild(cell);
    }
    focusIdx = -1;
  }

  function syncBoard() {
    for (let i = 0; i < game.cells.length; i++) {
      const cell = boardEl.children[i];
      const v = game.cells[i];
      let p = cell.querySelector('.piece');
      if (v > 0) {
        if (!p) {
          p = document.createElement('div');
          cell.appendChild(p);
        }
        p.className = 'piece p' + v;
        p.textContent = String(v);
      } else if (p) {
        p.remove();
      }
      cell.classList.toggle('plantable', v === 0 && game.allowPlant && !game.over);
    }
    syncHud();
  }

  function syncHud() {
    bankNum.textContent = String(game.bank);
    bankBadge.classList.toggle('empty', game.bank === 0);
    bankBadge.classList.remove('tick');
    void bankBadge.offsetWidth;
    bankBadge.classList.add('tick');
  }

  function onFocus(i) {
    if (focusIdx >= 0 && boardEl.children[focusIdx]) {
      boardEl.children[focusIdx].classList.remove('focus');
    }
    focusIdx = i;
    if (i >= 0) boardEl.children[i].classList.add('focus');
  }

  /* ================= 演出：消费 trace ================= */
  function cellCenter(i, rects, wrapRect) {
    const r = rects[i];
    return {
      x: r.left - wrapRect.left + r.width / 2,
      y: r.top - wrapRect.top + r.height / 2
    };
  }

  function bumpPiece(i, count) {
    const p = pieceEl(i);
    if (!p) return;
    p.className = 'piece p' + count;
    p.textContent = String(count);
    void p.offsetWidth;
    p.classList.add('bump');
    sfx.hit();
  }

  function blastPiece(i, rects, wrapRect) {
    const cell = cellEl(i);
    const p = pieceEl(i);
    if (p) {
      p.classList.add('blast');
      setTimeout(() => p.remove(), 240);
    }
    const c = cellCenter(i, rects, wrapRect);
    for (let k = 0; k < 9; k++) {
      const shard = document.createElement('div');
      shard.className = 'shard';
      const ang = Math.random() * Math.PI * 2;
      const dist = 26 + Math.random() * 44;
      shard.style.left = (c.x - 3.5) + 'px';
      shard.style.top = (c.y - 3.5) + 'px';
      shard.style.background = Math.random() < 0.5 ? '#f0a83c' : '#e8542d';
      boardWrap.appendChild(shard);
      void shard.offsetWidth;
      shard.style.transform = 'translate(' + Math.cos(ang) * dist + 'px,' + Math.sin(ang) * dist + 'px) rotate(' + (Math.random() * 180) + 'deg)';
      shard.style.opacity = '0';
      setTimeout(() => shard.remove(), 420);
    }
  }

  function flySpark(from, to, dist, rects, wrapRect) {
    return new Promise(resolve => {
      const a = cellCenter(from, rects, wrapRect);
      const b = cellCenter(to, rects, wrapRect);
      const spark = document.createElement('div');
      spark.className = 'spark';
      spark.style.left = '0';
      spark.style.top = '0';
      spark.style.transform = 'translate(' + (a.x - 5) + 'px,' + (a.y - 5) + 'px)';
      boardWrap.appendChild(spark);
      void spark.offsetWidth;
      const dur = SPARK_BASE + dist * SPARK_UNIT;
      spark.style.transitionDuration = dur + 'ms';
      spark.style.transform = 'translate(' + (b.x - 5) + 'px,' + (b.y - 5) + 'px)';
      setTimeout(() => {
        spark.remove();
        const p = pieceEl(to);
        if (p) {
          const next = Number(p.textContent) + 1;
          bumpPiece(to, Math.min(next, 3));
        }
        resolve();
      }, dur);
    });
  }

  async function playTrace(trace) {
    busy = true;
    clearHint();

    // 投点（或播种）
    const idx = trace.place.index;
    if (trace.place.planted) {
      const cell = cellEl(idx);
      const p = document.createElement('div');
      p.className = 'piece p1';
      p.textContent = '1';
      cell.appendChild(p);
      void p.offsetWidth;
      p.classList.add('bump');
      cell.classList.remove('plantable');
      sfx.plant();
    } else {
      const p = pieceEl(idx);
      if (p) {
        const next = trace.place.to;
        p.className = 'piece p' + Math.min(next, 3);
        p.textContent = String(next);
        void p.offsetWidth;
        p.classList.add('bump');
      }
      sfx.place();
    }
    syncHud();
    await wait(150);

    const rects = Array.from(boardEl.children).map(c => c.getBoundingClientRect());
    const wrapRect = boardWrap.getBoundingClientRect();
    let chainShown = false;

    for (let w = 0; w < trace.waves.length; w++) {
      const wave = trace.waves[w];
      if (w >= 1) {
        chainBadge.textContent = '连锁 ×' + (w + 1);
        chainBadge.classList.remove('hidden');
        void chainBadge.offsetWidth;
        chainBadge.style.animation = 'none';
        void chainBadge.offsetWidth;
        chainBadge.style.animation = '';
        boardWrap.classList.add('shake');
        setTimeout(() => boardWrap.classList.remove('shake'), 300);
        chainShown = true;
      }
      sfx.wave(w + 1);
      sfx.boom();

      for (const sp of wave.splits) {
        blastPiece(sp.index, rects, wrapRect);
      }

      const flights = wave.boosts.map(b => flySpark(b.from, b.to, b.dist, rects, wrapRect));
      await Promise.all(flights);
      await wait(130);
    }

    if (chainShown) {
      await wait(120);
      chainBadge.classList.add('hidden');
    }
    busy = false;
  }

  /* ================= 游戏流程 ================= */
  function startLevel(i) {
    levelIdx = i;
    level = LEVELS[i];
    game = E.newGame({ size: level.size, board: level.board, bank: level.bank, allowPlant: level.allowPlant });
    history = [];
    maxChain = 0;
    coach2Shown = false;
    hintStage = 0;
    $('level-name').textContent = level.id + ' ' + level.title;
    $('level-goal').textContent = '目标：清空棋盘 · 最优 ' + level.par + ' 点' + (level.allowPlant ? ' · 可播种' : '');
    buildBoard();
    syncBoard();
    showScreen('game');
    msg(level.intro);
    if (level.id === '1-1') coachShow('棋盘上的圆点是棋子，数字是点数。点数到 4 就会爆炸！点击一颗 3 点棋子，给它 +1。');
  }

  function tryPlay(idx) {
    if (busy || !game || game.over) return;
    if (coachVisible()) return;
    const r = E.applyMove(game, idx);
    if (!r.ok) {
      if (r.error === 'empty-no-plant') msg('空格放不了棋子——第五章解锁「播种」');
      else if (r.error === 'no-bank') msg('点数用完了');
      return;
    }
    history.push(game);
    game = r.state;
    maxChain = Math.max(maxChain, r.trace.waves.length);
    if (r.trace.waves.length === 0) hintStage = 0;
    msg('');
    playTrace(r.trace).then(onMoveDone);
  }

  function onMoveDone() {
    syncBoard();
    if (!game.over) return;
    if (game.win) {
      if (level.id === '1-1' && !coach2Shown) {
        coach2Shown = true;
        coachShow('爆！爆炸把同一横行和纵列上的棋子都 +1——另一颗 3 点棋子也到 4，跟着爆了。这就是连锁。');
        coachOnClose = showWin;
        return;
      }
      showWin();
    } else {
      showLose();
    }
  }

  function undo() {
    if (busy || history.length === 0) return;
    game = history.pop();
    syncBoard();
    clearHint();
    msg('已悔一步');
    hintStage = 0;
  }

  function resetLevel() {
    game = E.newGame({ size: level.size, board: level.board, bank: level.bank, allowPlant: level.allowPlant });
    history = [];
    maxChain = 0;
    hintStage = 0;
    buildBoard();
    syncBoard();
    msg('重新开始');
  }

  /* ================= 提示（免费，两级） ================= */
  function hintAdvice() {
    let has3 = false, has2 = false;
    for (const v of game.cells) {
      if (v === 3) has3 = true;
      if (v === 2) has2 = true;
    }
    if (has3) return '提示：找一颗 3 点棋子——它只差一点就要爆了。再点一次「提示」看具体位置。';
    if (has2) return '提示：想想哪颗棋子爆炸时能扫到最多伙伴，把点投给它。再点一次「提示」看具体位置。';
    return '提示：先喂养十字路口上的棋子当引信。再点一次「提示」看具体位置。';
  }

  function giveHint() {
    if (busy || !game || game.over) return;
    const now = Date.now();
    if (now - hintTimer > 12000) hintStage = 0;
    hintTimer = now;
    if (hintStage === 0) {
      msg(hintAdvice());
      hintStage = 1;
      return;
    }
    hintStage = 0;
    const res = S.solve(game, { timeBudget: 450 });
    if (!res) {
      msg('这局面提示器一时算不动——试试悔棋或重开。');
      return;
    }
    const idx = res.moves[0];
    if (idx === undefined) return;
    clearHint();
    const cell = cellEl(idx);
    cell.classList.add('hint-glow');
    const planted = game.cells[idx] === 0;
    msg(planted ? '提示：在这里播种一颗新棋子，接住冲击波。' : '提示：把点投给这颗棋子。');
    setTimeout(() => {
      cell.classList.remove('hint-glow');
    }, 4000);
  }

  function clearHint() {
    for (const c of boardEl.children) c.classList.remove('hint-glow');
  }

  /* ================= 面板 ================= */
  function showOverlay(html) {
    overlayBox.innerHTML = html;
    overlay.classList.remove('hidden');
  }
  function closeOverlay() {
    overlay.classList.add('hidden');
  }

  function showWin() {
    const stars = starFor(level, game.placed);
    const prev = progress.stars[level.id] || 0;
    progress.stars[level.id] = Math.max(prev, stars);
    saveProgress();
    sfx.win();
    const isLast = levelIdx === LEVELS.length - 1;
    let starHtml = '';
    for (let k = 1; k <= 3; k++) {
      starHtml += k <= stars ? '<span class="on">★</span>' : '<span class="off">★</span>';
    }
    showOverlay(
      '<h2 class="win">清空棋盘！</h2>' +
      '<div class="stars">' + starHtml + '</div>' +
      '<div class="stats">投点 ' + game.placed + ' / 最优 ' + level.par +
      ' · 最大连锁 ' + Math.max(maxChain, 1) + ' 波 · 剩余 ' + game.bank + ' 点</div>' +
      '<div class="actions">' +
      (isLast ? '<button class="ctl primary" id="ov-menu">通关！回菜单</button>'
              : '<button class="ctl primary" id="ov-next">下一关 →</button>') +
      '<button class="ctl" id="ov-retry">再玩一次</button>' +
      (isLast ? '' : '<button class="ctl" id="ov-menu">回菜单</button>') +
      '</div>'
    );
    const next = $('ov-next');
    if (next) next.addEventListener('click', () => { closeOverlay(); startLevel(levelIdx + 1); });
    $('ov-retry').addEventListener('click', () => { closeOverlay(); resetLevel(); });
    $('ov-menu').addEventListener('click', () => { closeOverlay(); goMenu(); });
  }

  function showLose() {
    sfx.lose();
    let pieces = 0;
    for (const v of game.cells) if (v > 0) pieces++;
    showOverlay(
      '<h2 class="lose">点数用完了</h2>' +
      '<div class="stats">棋盘上还剩 ' + pieces + ' 颗棋子。<br>同一关卡布局固定——看看最优解，背板再战。</div>' +
      '<div class="actions">' +
      '<button class="ctl primary" id="ov-reveal">看答案</button>' +
      '<button class="ctl" id="ov-retry">重试</button>' +
      '<button class="ctl" id="ov-menu">回菜单</button>' +
      '</div>'
    );
    $('ov-reveal').addEventListener('click', revealAnswer);
    $('ov-retry').addEventListener('click', () => { closeOverlay(); resetLevel(); });
    $('ov-menu').addEventListener('click', () => { closeOverlay(); goMenu(); });
  }

  async function revealAnswer() {
    closeOverlay();
    resetLevel();
    msg('最优解演示…');
    const res = S.solve(game, { timeBudget: 4000 });
    if (!res) {
      msg('提示器暂时算不动，直接再试一次吧');
      return;
    }
    busy = true;
    for (const mv of res.moves) {
      const r = E.applyMove(game, mv);
      game = r.state;
      maxChain = Math.max(maxChain, r.trace.waves.length);
      await playTrace(r.trace);
      syncBoard();
      await wait(560);
    }
    busy = false;
    showOverlay(
      '<h2 class="win">轮到你了</h2>' +
      '<div class="stats">这是 ' + res.moves.length + ' 步的最优解。<br>布局不变，再来一次。</div>' +
      '<div class="actions">' +
      '<button class="ctl primary" id="ov-retry">再试一次</button>' +
      '<button class="ctl" id="ov-menu">回菜单</button>' +
      '</div>'
    );
    $('ov-retry').addEventListener('click', () => { closeOverlay(); resetLevel(); });
    $('ov-menu').addEventListener('click', () => { closeOverlay(); goMenu(); });
  }

  function showHelp() {
    showOverlay(
      '<h2>玩法</h2>' +
      '<div class="rules">' +
      '1. 点击棋子给它 <b>+1 点</b>，手牌点数有限。<br>' +
      '2. 棋子到 <b>4 点</b>即爆：本身消失，<b>同一横行和纵列</b>的棋子全部 +1。<br>' +
      '3. 被 +1 到 4 的棋子连锁爆炸，一波接一波。<br>' +
      '4. <b>清空棋盘</b>即胜；手牌用尽仍未清空则失败。<br>' +
      '5. 星级按投点数算：<b>≤最优 3 星</b>，≤最优+1 得 2 星。<br>' +
      '6. 提示免费、悔棋随便用；失败可看答案，布局固定背板再战。<br>' +
      '7. 第五章解锁「播种」：点空格花 1 点放一颗新棋子，接住冲击波。<br>' +
      '</div>' +
      '<div class="actions"><button class="ctl primary" id="ov-close">开始</button></div>'
    );
    $('ov-close').addEventListener('click', closeOverlay);
  }

  /* ================= 教程层 ================= */
  let coachOnClose = null;
  function coachVisible() { return !coachEl.classList.contains('hidden'); }
  function coachShow(text) {
    coachText.textContent = text;
    coachEl.classList.remove('hidden');
  }
  $('coach-next').addEventListener('click', () => {
    coachEl.classList.add('hidden');
    const cb = coachOnClose;
    coachOnClose = null;
    if (cb) cb();
  });

  /* ================= 导航 ================= */
  function showScreen(name) {
    menuScreen.classList.toggle('hidden', name !== 'menu');
    gameScreen.classList.toggle('hidden', name !== 'game');
  }
  function goMenu() {
    showScreen('menu');
    renderMenu();
  }
  $('home-button').addEventListener('click', goMenu);
  $('help-button').addEventListener('click', showHelp);
  $('btn-menu').addEventListener('click', goMenu);
  $('btn-undo').addEventListener('click', undo);
  $('btn-restart').addEventListener('click', () => { if (!busy) resetLevel(); });
  $('btn-hint').addEventListener('click', giveHint);

  const resetBtn = $('reset-progress');
  resetBtn.addEventListener('click', () => {
    if (resetBtn.dataset.armed) {
      progress = { stars: {} };
      saveProgress();
      delete resetBtn.dataset.armed;
      resetBtn.textContent = '重置进度';
      renderMenu();
    } else {
      resetBtn.dataset.armed = '1';
      resetBtn.textContent = '再点一次确认清空';
      setTimeout(() => {
        delete resetBtn.dataset.armed;
        resetBtn.textContent = '重置进度';
      }, 2600);
    }
  });

  /* ================= 键盘 ================= */
  document.addEventListener('keydown', e => {
    if (gameScreen.classList.contains('hidden')) return;
    if (coachVisible()) return;
    if (!overlay.classList.contains('hidden')) {
      if (e.key === 'Escape') closeOverlay();
      return;
    }
    const size = game ? game.size : 6;
    let handled = true;
    switch (e.key) {
      case 'ArrowUp': onFocus(focusIdx < 0 ? 0 : (focusIdx - size + game.cells.length) % game.cells.length); break;
      case 'ArrowDown': onFocus(focusIdx < 0 ? 0 : (focusIdx + size) % game.cells.length); break;
      case 'ArrowLeft': onFocus(focusIdx < 0 ? 0 : (focusIdx - 1 + game.cells.length) % game.cells.length); break;
      case 'ArrowRight': onFocus(focusIdx < 0 ? 0 : (focusIdx + 1) % game.cells.length); break;
      case 'Enter': case ' ': if (focusIdx >= 0) tryPlay(focusIdx); break;
      case 'u': case 'U': undo(); break;
      case 'r': case 'R': if (!busy) resetLevel(); break;
      case 'h': case 'H': giveHint(); break;
      case 'Escape': goMenu(); break;
      default: handled = false;
    }
    if (handled) e.preventDefault();
  });

  /* ================= 启动 ================= */
  renderMenu();
  showScreen('menu');
})();
