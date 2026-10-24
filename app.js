/* 十字连爆 · chess-crash — 交互、演出与进度（v1.3.0）
 *
 * 依赖：engine.js / solver.js / levels.js / challenge.js（全局 CC_*）
 *
 * 三种玩法共用一套棋盘与演出：
 * - 战役（80 关，形状棋自第三章登场）；无限挑战（难度递增、失败即结算、跑分纪录）；
 *   每日挑战（日期种子，全站同款，星数取当天最佳）。
 * 演出核心：消费 applyMove 的 trace，
 * 按波次播放「分裂爆炸 → 冲击光点按形状波及路径按距离飞行 → 到达 +1」。
 * 连锁波数驱动徽章、震屏与音高阶梯；动画中点击可加速。
 * 特殊形状（横线/竖线/三角 T/方框）各有棋形外观与冲击光点配色；
 * 一次点击消除多颗时播放激励音（波内多消喝彩 + 结算连消琶音）。
 * 提示免费；失败可看答案回放；三星过关撒彩带。
 */
(function () {
  'use strict';

  const E = window.CC_ENGINE;
  const S = window.CC_SOLVER;
  const LEVELS = window.CC_LEVELS;
  const CHAPTERS = window.CC_CHAPTERS;
  const starFor = window.CC_STAR_FOR;
  const unlocked = window.CC_UNLOCKED;
  const CH = window.CC_CHALLENGE;

  /* kind → 棋子形状 class（0 = 普通圆点，无 class） */
  const KIND_CLASS = ['', 'k-row', 'k-col', 'k-tri-u', 'k-tri-d', 'k-tri-l', 'k-tri-r', 'k-sq'];
  /* kind → 冲击光点配色 class（0 = 默认橙） */
  const SPARK_CLASS = ['', 'sk-row', 'sk-col', 'sk-tri', 'sk-tri', 'sk-tri', 'sk-tri', 'sk-sq'];
  const kindClassOf = v => KIND_CLASS[E.kindOf(v)] || '';

  const $ = id => document.getElementById(id);
  const menuScreen = $('screen-menu');
  const gameScreen = $('screen-game');
  const boardEl = $('board');
  const boardWrap = $('board-wrap');
  const chainBadge = $('chain-badge');
  const msgEl = $('msg');
  const bankNum = $('bank-num');
  const bankBadge = $('bank-badge');
  const piecesNum = $('pieces-num');
  const piecesBadge = $('pieces-badge');
  const overlay = $('overlay');
  const overlayBox = $('overlay-box');
  const coachEl = $('coach');
  const coachText = $('coach-text');

  const KEY = 'cc-progress-v1';
  const KEY_DAILY = 'cc-daily-v1';
  const KEY_RUN = 'cc-challenge-best-v1';
  const KEY_SOUND = 'cc-sound';
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
  let animSpeed = 1;       // 动画中点击可加速到 0.35
  let runCtx = null;       // { mode: 'campaign'|'challenge'|'daily', stage, seed, runPlaced, runMaxChain }

  /* ================= 存档 ================= */
  function loadJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      if (v !== null && v !== undefined) return v;
    } catch (e) { /* 损坏则回退 */ }
    return fallback;
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 隐私模式忽略 */ }
  }
  function loadProgress() {
    const v = loadJSON(KEY, null);
    if (v && typeof v === 'object' && v.stars) return v;
    return { stars: {} };
  }
  const saveProgress = () => saveJSON(KEY, progress);

  /* ================= 音效（WebAudio 合成，可静音） ================= */
  let soundOn = loadJSON(KEY_SOUND, 'on') !== 'off';
  const sfx = (function () {
    let ctx = null;
    function ensure() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur, opts) {
      if (!soundOn) return;
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
      /* 激励音：波内一次多消 → 清亮双音喝彩（音高随消除数上抬） */
      cheer(n) {
        const f = 1174 * Math.pow(2, Math.min(n, 8) / 24);
        tone(f, 0.09, { type: 'sine', gain: 0.07 });
        setTimeout(() => tone(f * 1.25, 0.09, { type: 'sine', gain: 0.06 }), 60);
      },
      /* 激励音：单次点击累计消除 ≥3 → 上行琶音，消得越多音越长 */
      streak(n) {
        const notes = [659, 784, 988, 1319, 1568];
        const cnt = Math.min(3 + Math.floor((n - 3) / 2), 5);
        for (let i = 0; i < cnt; i++) {
          setTimeout(() => tone(notes[i], 0.13, { type: 'triangle', gain: 0.09 }), i * 75);
        }
      },
      win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.2, { type: 'triangle', gain: 0.1 }), i * 110)); },
      lose() { [330, 262, 208].forEach((f, i) => setTimeout(() => tone(f, 0.24, { type: 'sine', gain: 0.1 }), i * 140)); }
    };
  })();
  document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

  function syncSoundButton() {
    $('sound-button').textContent = soundOn ? '🔊' : '🔇';
  }
  $('sound-button').addEventListener('click', () => {
    soundOn = !soundOn;
    saveJSON(KEY_SOUND, soundOn ? 'on' : 'off');
    syncSoundButton();
    msg(soundOn ? '音效已开' : '音效已关');
  });

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
  function speedUp() { if (busy) animSpeed = Math.min(animSpeed, 0.35); }
  function confetti() {
    const colors = ['#ff8a3d', '#f0a83c', '#4fa3d1', '#3aa76d', '#e8542d'];
    for (let i = 0; i < 26; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = (Math.random() * 100) + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = (Math.random() * 0.35) + 's';
      c.style.animationDuration = (1.1 + Math.random() * 0.7) + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 2400);
    }
  }

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
    const chapterCount = Math.max.apply(null, LEVELS.map(l => l.chapter));
    for (let ch = 1; ch <= chapterCount; ch++) {
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
    renderChallengeCards();
  }
  function starsHtml(n) {
    let s = '';
    for (let k = 1; k <= 3; k++) s += '<span class="' + (k <= n ? '' : 'off') + '">★</span>';
    return s;
  }
  function renderChallengeCards() {
    const host = $('challenge-cards');
    host.innerHTML = '';
    const best = loadJSON(KEY_RUN, null);
    const dailyRec = loadJSON(KEY_DAILY, null);
    const today = CH.dateKey(new Date());
    const isToday = !!(dailyRec && dailyRec.date === today && dailyRec.level);

    const runCard = document.createElement('button');
    runCard.type = 'button';
    runCard.className = 'challenge-card';
    runCard.innerHTML =
      '<div class="cc-title">♾ 无限挑战</div>' +
      '<div class="cc-sub">' + (best && best.stage
        ? '最佳：通过 ' + best.stage + ' 关<br>越打越紧，失败即结算'
        : '一关接一关，越打越紧<br>失败即结算') + '</div>';
    runCard.addEventListener('click', startChallenge);

    const dailyCard = document.createElement('button');
    dailyCard.type = 'button';
    dailyCard.className = 'challenge-card' + (isToday && dailyRec.stars > 0 ? ' done' : '');
    dailyCard.innerHTML =
      '<div class="cc-title">📅 每日挑战</div>' +
      '<div class="cc-sub">' + (isToday
        ? (dailyRec.stars > 0 ? '今日完成 ★' + dailyRec.stars + '<br>可重打取最佳' : '今日关卡已就绪<br>一天一关，全站同款')
        : today + ' · 一天一关<br>全站同款，星数取最佳') + '</div>';
    dailyCard.addEventListener('click', startDaily);

    host.appendChild(runCard);
    host.appendChild(dailyCard);
  }

  /* ================= 挑战模式 ================= */
  function startChallenge() {
    const prevBest = loadJSON(KEY_RUN, null);
    runCtx = {
      mode: 'challenge',
      stage: 0,
      seed: (Date.now() & 0x7fffffff) ^ ((Math.random() * 0x7fffffff) | 0),
      runPlaced: 0,
      runMaxChain: 0,
      startBest: (prevBest && prevBest.stage) || 0
    };
    showScreen('game');
    msg('正在生成第 1 关…');
    setTimeout(() => {
      const lv = CH.makeChallenge(0, runCtx.seed);
      if (!lv) { msg('生成失败，点「重开」再试'); return; }
      loadLevel(lv);
    }, 40);
  }

  function nextChallengeStage() {
    const stage = runCtx.stage;
    msg('正在生成第 ' + (stage + 1) + ' 关…');
    busy = true;
    setTimeout(() => {
      const lv = CH.makeChallenge(stage, runCtx.seed);
      busy = false;
      if (!lv) { msg('生成失败，点「重开」再试'); return; }
      loadLevel(lv);
    }, 40);
  }

  function startDaily() {
    showScreen('game');
    msg('正在准备今日关卡…');
    setTimeout(() => {
      const rec = getDailyRecord();
      if (!rec) { msg('今日关卡生成失败，稍后再试'); return; }
      runCtx = { mode: 'daily' };
      loadLevel(rec.level);
    }, 40);
  }

  function getDailyRecord() {
    const today = CH.dateKey(new Date());
    let rec = loadJSON(KEY_DAILY, null);
    if (rec && rec.date === today && rec.level) return rec;
    const lv = CH.makeDaily(new Date());
    if (!lv) return null;
    rec = { date: today, level: lv, stars: 0 };
    saveJSON(KEY_DAILY, rec);
    return rec;
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
        const kc = kindClassOf(v);
        p.className = 'piece p' + E.pointsOf(v) + (kc ? ' ' + kc : '');
        p.textContent = String(E.pointsOf(v));
        cell.appendChild(p);
      } else if (game.allowPlant) {
        cell.classList.add('plantable');
      }
      cell.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        if (busy) { speedUp(); return; }
        onFocus(i);
        tryPlay(i);
      });
      boardEl.appendChild(cell);
    }
    focusIdx = -1;
  }

  function syncBoard() {
    let pieces = 0;
    for (let i = 0; i < game.cells.length; i++) {
      const cell = boardEl.children[i];
      const v = game.cells[i];
      if (v > 0) pieces++;
      let p = cell.querySelector('.piece');
      if (v > 0) {
        if (!p) {
          p = document.createElement('div');
          cell.appendChild(p);
        }
        const kc = kindClassOf(v);
        p.className = 'piece p' + E.pointsOf(v) + (kc ? ' ' + kc : '');
        p.textContent = String(E.pointsOf(v));
      } else if (p) {
        p.remove();
      }
      cell.classList.toggle('plantable', v === 0 && game.allowPlant && !game.over);
    }
    piecesNum.textContent = String(pieces);
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
    const kc = (p.className.match(/k-[a-z-]+/) || [''])[0];
    p.className = 'piece p' + count + (kc ? ' ' + kc : '');
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

  function flySpark(from, to, dist, k, rects, wrapRect) {
    return new Promise(resolve => {
      const a = cellCenter(from, rects, wrapRect);
      const b = cellCenter(to, rects, wrapRect);
      const spark = document.createElement('div');
      spark.className = 'spark' + (SPARK_CLASS[k] ? ' ' + SPARK_CLASS[k] : '');
      spark.style.left = '0';
      spark.style.top = '0';
      spark.style.transform = 'translate(' + (a.x - 5) + 'px,' + (a.y - 5) + 'px)';
      boardWrap.appendChild(spark);
      void spark.offsetWidth;
      const dur = Math.max(40, (SPARK_BASE + dist * SPARK_UNIT) * animSpeed);
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
    animSpeed = 1;
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
        const next = E.pointsOf(trace.place.to);
        const kc = KIND_CLASS[trace.place.kind] || '';
        p.className = 'piece p' + Math.min(next, 3) + (kc ? ' ' + kc : '');
        p.textContent = String(next);
        void p.offsetWidth;
        p.classList.add('bump');
      }
      sfx.place();
    }
    syncHud();
    await wait(150 * animSpeed);

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
      if (wave.splits.length >= 2) sfx.cheer(wave.splits.length);

      for (const sp of wave.splits) {
        blastPiece(sp.index, rects, wrapRect);
      }

      const flights = wave.boosts.map(b => flySpark(b.from, b.to, b.dist, b.k, rects, wrapRect));
      await Promise.all(flights);
      await wait(130 * animSpeed);
    }

    if (chainShown) {
      await wait(120 * animSpeed);
      chainBadge.classList.add('hidden');
    }
    if (trace.splits >= 3) sfx.streak(trace.splits);
    busy = false;
  }

  /* ================= 游戏流程 ================= */
  function loadLevel(lv) {
    level = lv;
    levelIdx = runCtx && runCtx.mode === 'campaign' ? LEVELS.indexOf(lv) : -1;
    game = E.newGame({ size: lv.size, board: lv.board, bank: lv.bank, allowPlant: lv.allowPlant });
    history = [];
    maxChain = 0;
    coach2Shown = false;
    hintStage = 0;
    $('level-name').textContent = lv.id + ' ' + lv.title;
    $('level-goal').textContent = '目标：清空棋盘 · 最优 ' + lv.par + ' 点' + (lv.allowPlant ? ' · 可播种' : '');
    buildBoard();
    syncBoard();
    showScreen('game');
    msg(lv.intro);
    if (lv.id === '1-1') coachShow('棋盘上的圆点是棋子，数字是点数。点数到 4 就会爆炸！点击一颗 3 点棋子，给它 +1。');
  }

  function startLevel(i) {
    runCtx = { mode: 'campaign' };
    loadLevel(LEVELS[i]);
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
      if (runCtx && runCtx.mode === 'challenge') return showChallengeWin();
      if (runCtx && runCtx.mode === 'daily') return showDailyWin();
      if (level.id === '1-1' && !coach2Shown) {
        coach2Shown = true;
        coachShow('爆！爆炸把同一横行和纵列上的棋子都 +1——另一颗 3 点棋子也到 4，跟着爆了。这就是连锁。');
        coachOnClose = showWin;
        return;
      }
      showWin();
    } else {
      if (runCtx && runCtx.mode === 'challenge') return showChallengeEnd();
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
      if (v === 0) continue;
      const p = E.pointsOf(v);
      if (p === 3) has3 = true;
      if (p === 2) has2 = true;
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
  function starsPanelHtml(stars) {
    let s = '';
    for (let k = 1; k <= 3; k++) {
      s += k <= stars ? '<span class="on">★</span>' : '<span class="off">★</span>';
    }
    return '<div class="stars">' + s + '</div>';
  }

  function showWin() {
    const stars = starFor(level, game.placed);
    const prev = progress.stars[level.id] || 0;
    progress.stars[level.id] = Math.max(prev, stars);
    saveProgress();
    sfx.win();
    if (stars === 3) confetti();
    const isLast = levelIdx === LEVELS.length - 1;
    showOverlay(
      '<h2 class="win">清空棋盘！</h2>' +
      starsPanelHtml(stars) +
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

  function showChallengeWin() {
    const stars = starFor(level, game.placed);
    runCtx.runPlaced += game.placed;
    runCtx.runMaxChain = Math.max(runCtx.runMaxChain, maxChain);
    const passed = runCtx.stage + 1;
    const best = loadJSON(KEY_RUN, null);
    if (!best || passed > best.stage) {
      saveJSON(KEY_RUN, { stage: passed, date: CH.dateKey(new Date()) });
    }
    sfx.win();
    if (stars === 3) confetti();
    showOverlay(
      '<h2 class="win">第 ' + passed + ' 关通过！</h2>' +
      starsPanelHtml(stars) +
      '<div class="stats">本关投点 ' + game.placed + ' / 最优 ' + level.par +
      ' · 本轮最大连锁 ' + Math.max(runCtx.runMaxChain, 1) + ' 波</div>' +
      '<div class="actions">' +
      '<button class="ctl primary" id="ov-next">下一关 →</button>' +
      '<button class="ctl" id="ov-menu">见好就收，回菜单</button>' +
      '</div>'
    );
    $('ov-next').addEventListener('click', () => {
      closeOverlay();
      runCtx.stage = passed;
      nextChallengeStage();
    });
    $('ov-menu').addEventListener('click', () => { closeOverlay(); goMenu(); });
  }

  function showChallengeEnd() {
    sfx.lose();
    const passed = runCtx.stage;
    const best = loadJSON(KEY_RUN, null);
    // 与本轮开跑前的纪录比较：胜利途中已实时更新 best，直接比会永远持平
    const isRecord = passed > (runCtx.startBest || 0) && passed > 0;
    if (isRecord && passed > 0) {
      saveJSON(KEY_RUN, { stage: passed, date: CH.dateKey(new Date()) });
    }
    showOverlay(
      '<h2 class="lose">本轮结束</h2>' +
      '<div class="stats">通过 ' + passed + ' 关 · 累计投点 ' + runCtx.runPlaced +
      ' · 最大连锁 ' + Math.max(runCtx.runMaxChain, 1) + ' 波' +
      (isRecord && passed > 0 ? '<br><b>新纪录！</b>' : (best ? '<br>最佳：通过 ' + Math.max(best.stage, passed) + ' 关' : '')) +
      '</div>' +
      '<div class="actions">' +
      '<button class="ctl primary" id="ov-retry">再来一轮</button>' +
      '<button class="ctl" id="ov-menu">回菜单</button>' +
      '</div>'
    );
    $('ov-retry').addEventListener('click', () => { closeOverlay(); startChallenge(); });
    $('ov-menu').addEventListener('click', () => { closeOverlay(); goMenu(); });
  }

  function showDailyWin() {
    const stars = starFor(level, game.placed);
    let rec = loadJSON(KEY_DAILY, null);
    const today = CH.dateKey(new Date());
    if (rec && rec.date === today) {
      rec.stars = Math.max(rec.stars || 0, stars);
      saveJSON(KEY_DAILY, rec);
    }
    sfx.win();
    if (stars === 3) confetti();
    showOverlay(
      '<h2 class="win">今日挑战完成</h2>' +
      starsPanelHtml(stars) +
      '<div class="stats">投点 ' + game.placed + ' / 最优 ' + level.par +
      ' · 最大连锁 ' + Math.max(maxChain, 1) + ' 波<br>星数取当天最佳，可随时重打。</div>' +
      '<div class="actions">' +
      '<button class="ctl primary" id="ov-retry">再打一次</button>' +
      '<button class="ctl" id="ov-menu">回菜单</button>' +
      '</div>'
    );
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
      '2. 棋子到 <b>4 点</b>即爆：本身消失，按形状波及全场——普通<b>十字</b>（同行同列）、<b>横线</b>整行、<b>竖线</b>整列、<b>三角</b> T 形、<b>方框</b>一圈，被波及的棋子全部 +1。<br>' +
      '3. 被 +1 到 4 的棋子连锁爆炸，一波接一波；一次连消多颗还有喝彩音。<br>' +
      '4. <b>清空棋盘</b>即胜；手牌用尽仍未清空则失败。<br>' +
      '5. 战役 80 关：星级按投点数算，<b>≤最优 3 星</b>；第三章起特殊形状登场，第七章解锁「播种」。<br>' +
      '6. 无限挑战：一关接一关越打越紧，失败即结算，冲击最深纪录。<br>' +
      '7. 每日挑战：日期定关卡，全站同款，星数取当天最佳。<br>' +
      '8. 提示免费、悔棋随便用；连锁动画中点棋盘可<b>加速</b>；右上角可<b>静音</b>。<br>' +
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
  $('btn-restart').addEventListener('click', () => {
    if (busy) return;
    if (runCtx && runCtx.mode === 'challenge' && game && game.over && !game.win) {
      startChallenge();
      return;
    }
    resetLevel();
  });
  $('btn-hint').addEventListener('click', giveHint);

  const resetBtn = $('reset-progress');
  resetBtn.addEventListener('click', () => {
    if (resetBtn.dataset.armed) {
      progress = { stars: {} };
      saveProgress();
      localStorage.removeItem(KEY_DAILY);
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
    if (busy && (e.key === 'Enter' || e.key === ' ')) {
      speedUp();
      e.preventDefault();
      return;
    }
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
  syncSoundButton();
  renderMenu();
  showScreen('menu');
})();
