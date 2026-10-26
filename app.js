/* 十字连爆 · chess-crash — 交互、演出与进度（v1.7.0 正确落位音 + 播种开放 + 三连胜庆祝）
 *
 * 依赖：engine.js / solver.js / levels.js / challenge.js（全局 CC_*）
 *
 * 三种玩法共用一套棋盘与演出：
 * - 战役（80 关，形状棋自第二章登场，每章第一关直接开放）；无限挑战（难度递增、失败即结算、跑分纪录）；
 *   每日挑战（日期种子，全站同款，星数取当天最佳）。
 * 演出核心：消费 applyMove 的 trace，
 * 按波次播放「分裂爆炸 → 激光束按形状波及路径射向目标 → 命中爆闪 +1」。
 * 连锁波数驱动徽章、震屏与音高阶梯；动画中点击可加速。
 * 特殊形状（横线/竖线/三角 T/方框）各有棋形外观与激光束配色；
 * 一次点击消除多颗时播放激励音（波内多消喝彩 + 结算连消琶音）。
 * v1.6.0 打击感增强：
 * - 分裂演出：冲击波环（形状族配色）+ 形状定向碎片（横线沿行/竖线沿列/三角朝角/方框八向）；
 *   顿帧（重波落地微停 + 棋盘闪光）；震屏三档；连锁徽章分档变色。
 * - 正反馈：弹字评价（双消/妙/漂亮/史诗连锁/神之一手，上浮渐隐）；
 *   剩余棋子逐波倒计时脉冲。
 * - 音效重制：压缩器母线 + 三层爆音（谐波滑落 + 低频 kick + 噪声爆裂）；
 *   音高阶梯叠高八度 sparkle、命中双音、喝彩三和弦、评价配套音、琶音八度冠音。
 * v1.6.1 激光束：冲击波传播从「光点飞行」改为「激光束射击」——白亮芯 + 族色辉光，
 * 从爆源极速伸出命中（命中端亮头 + 十字星爆闪），随后驻留发光、收细消散；
 * 多目标齐射读得出形状（整行扫射/纵列光雨/T 形光阵/八向环射）。
 * v1.6.2 震荡波与激光加粗：方框不再走激光——从源扩散两圈方形震荡环（绿族），
 * 方环外沿同时扫到 8 邻域（与切比雪夫格距天然同步命中），第二圈延迟跟随成「震荡」余波；
 * 激光束整体加粗（8px 双层辉光 + 更亮白芯 + 更大命中头），方框源冲击波环也改方形轮廓。
 * v1.6.3 贯穿激光刀 + 震荡波修复：
 * - 激光重构为「贯穿刀」：按爆源分组一次开刀——十字=整行+整列四向全刀（贯穿全盘的十字光）、
 *   横线一刀贯穿整行、竖线贯穿整列、三角=整行+半列的 T 形刀阵；刀锋贯出棋盘边缘。
 *   刀尖亮点沿线性扫射推进，扫过目标的瞬间即命中（格距 × 每格毫秒，前端与动画同步）；
 *   先充能（刀尖亮起）再扫射，随后驻留发光、收细消散。
 * - 修复震荡波收尾跳变：环改 fill:forwards + 基础隐藏样式，动画结束后不再回退到
 *   未居中的全不透明状态（旧版会在移除前闪现 60ms 错位方环）。
 * - 激光再加粗：10px 束身 + 3.2px 白芯 + 15px 命中头，双层辉光增强。
 * v1.6.4 单裂开光 + 刀锋收口：
 * - 分裂即开光路（有无目标都开）：单个棋子裂开也射贯穿刀/震荡环——终波不再只有碎片飞散，
 *   每一爆都看得到波及范围的光（十字四向刀/横竖一刀/T 形刀阵/方框震荡环）；
 * - 刀锋收口：贯穿余量 0.45 格 → 0.1 格，光刀不再大段冲出棋盘，刀尖亮点在边缘收口。
 * v1.6.5 震荡波修形 + 波面裁剪：
 * - 震荡环去掉内阴影雾面（旧版像一团绿雾方块）——改利落方形描边 + 外辉光，圆角 22%→12%；
 *   余波环细一档（1.5px、无辉光、峰值透明度减半），收尾 280ms→170ms 少拖影；
 * - 波面裁剪：环绘制在贴棋盘的 .ripple-clip 容器（overflow hidden）内，
 *   靠边的方框震荡波贴边截断，不再超出棋盘。
 * v1.7.0 引导与激励三件套：
 * - 正确落位音：每手落子后轻预算后台求解——局面仍能按最优（三星）路径清盘时，
 *   播明显的确认音（上行双铃）；求解超时 / 已偏离最优 / 必败则不响，胜利另有礼乐。
 * - 播种开放：播种自第六章登场后，第七章起关卡全部开放（55/80）——
 *   播种是给玩家的额外工具；par 仍按设计最优（关卡数据不变），
 *   播种位虚线提示只画「接波位」（任一存活棋子波及范围内的空格），避免大盘噪点。
 * - 三连胜庆祝：连胜计数持久化（胜 +1、败清零），每逢 3 的倍数——
 *   胜利弹窗升级为金色烟花庆典（皇冠 + 金框礼盒 + 视口烟花 + 礼赞音）。
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
  /* kind → 激光束/命中爆闪配色 class（0 = 默认橙） */
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
  const RING_BASE = 70;    // 震荡波扩散基础毫秒（v1.6.2 方框方环）
  const RING_UNIT = 12;    // 震荡波每格扩散毫秒
  const LASER_CHARGE = 45; // 贯穿激光充能毫秒（v1.6.3：刀尖先亮起再扫射）
  const LASER_RATE = 15;   // 贯穿激光每格扫射毫秒——刀尖扫到即命中
  const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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

  /* ================= 音效（WebAudio 合成，可静音；v1.6.0 重制打击感） ================= */
  /* 打击感三层结构：低频 kick（分量）+ 噪声爆裂（脆度）+ 谐波滑落（音头）；
   * 全部音源过 DynamicsCompressor 母线——多音叠加不爆音、响度统一。
   * tone/noise 都支持 delay（按音频时钟精确排程，替代 setTimeout）。 */
  let soundOn = loadJSON(KEY_SOUND, 'on') !== 'off';
  const sfx = (function () {
    let ctx = null;
    let master = null;      // 压缩器母线
    let noiseBuf = null;    // 预生成白噪声（爆裂层复用）
    function ensure() {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createDynamicsCompressor();
        master.threshold.value = -18;
        master.knee.value = 24;
        master.ratio.value = 6;
        master.connect(ctx.destination);
        const len = Math.floor(ctx.sampleRate * 0.25);
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur, opts) {
      if (!soundOn) return;
      opts = opts || {};
      try {
        const c = ensure();
        const t0 = c.currentTime + (opts.delay || 0);
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = opts.type || 'sine';
        o.frequency.setValueAtTime(freq, t0);
        if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(opts.gain || 0.12, t0 + 0.012); /* 快起音，避免咔哒 */
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        o.connect(g);
        g.connect(master);
        o.start(t0);
        o.stop(t0 + dur + 0.02);
      } catch (e) { /* 音频不可用则静默 */ }
    }
    /* 白噪声 + 低通扫频：爆裂的“脆” */
    function noise(dur, opts) {
      if (!soundOn) return;
      opts = opts || {};
      try {
        const c = ensure();
        const t0 = c.currentTime + (opts.delay || 0);
        const s = c.createBufferSource();
        s.buffer = noiseBuf;
        s.loop = true;
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(opts.from || 2600, t0);
        f.frequency.exponentialRampToValueAtTime(opts.to || 300, t0 + dur);
        f.Q.value = 0.8;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(opts.gain || 0.16, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        s.connect(f);
        f.connect(g);
        g.connect(master);
        s.start(t0);
        s.stop(t0 + dur + 0.02);
      } catch (e) { /* 静默 */ }
    }
    return {
      unlock() { try { ensure(); } catch (e) { /* noop */ } },
      place() { tone(520, 0.09, { type: 'triangle' }); tone(780, 0.06, { type: 'sine', gain: 0.05, delay: 0.015 }); },
      plant() { tone(392, 0.14, { type: 'sine', slide: 560 }); tone(784, 0.1, { type: 'sine', gain: 0.05, delay: 0.05 }); },
      /* 连锁音高阶梯：主方波 + 高两个八度的 sparkle 短 ping（v1.6.0，听感更“亮”） */
      wave(n) {
        const k = Math.min(n, 24);
        tone(277 * Math.pow(2, k / 12), 0.2, { type: 'square', gain: 0.06 });
        tone(2216 * Math.pow(2, k / 24), 0.07, { type: 'sine', gain: 0.045, delay: 0.02 });
      },
      hit() { tone(932, 0.05, { type: 'triangle', gain: 0.05 }); tone(1398, 0.04, { type: 'sine', gain: 0.028, delay: 0.012 }); },
      /* 分裂爆音三层（v1.6.0）：saw 谐波滑落 + sine 低频 kick + 噪声爆裂 */
      boom() {
        tone(110, 0.32, { type: 'sawtooth', gain: 0.12, slide: 45 });
        tone(150, 0.18, { type: 'sine', gain: 0.26, slide: 42 });
        noise(0.16, { from: 2600, to: 280, gain: 0.15 });
      },
      /* v1.6.1 电光音：激光齐射的“滋”——与 boom 叠成「充能爆射」 */
      zap() {
        tone(920, 0.09, { type: 'sawtooth', gain: 0.05, slide: 320 });
        tone(1840, 0.05, { type: 'square', gain: 0.022, slide: 920, delay: 0.012 });
      },
      /* v1.6.2 震荡波低鸣：方框方环扩散的“嗡”（低频双音下滑） */
      pulse() {
        tone(105, 0.16, { type: 'sine', gain: 0.2, slide: 58 });
        tone(210, 0.1, { type: 'sine', gain: 0.06, slide: 150 });
      },
      /* 激励音：波内一次多消 → 大三度和弦喝彩（音高随消除数上抬） */
      cheer(n) {
        const f = 1174 * Math.pow(2, Math.min(n, 8) / 24);
        tone(f, 0.09, { type: 'sine', gain: 0.07 });
        tone(f * 1.25, 0.09, { type: 'sine', gain: 0.06, delay: 0.06 });
        tone(f * 1.5, 0.09, { type: 'sine', gain: 0.05, delay: 0.12 });
      },
      /* 弹字评价配套音（v1.6.0）：档位越高叠音越多 */
      praise(t) {
        const base = 880 + t * 180;
        tone(base, 0.08, { type: 'sine', gain: 0.07 });
        tone(base * 1.5, 0.1, { type: 'sine', gain: 0.06, delay: 0.07 });
        if (t >= 2) tone(base * 2, 0.12, { type: 'triangle', gain: 0.06, delay: 0.14 });
        if (t >= 3) noise(0.2, { from: 5000, to: 1500, gain: 0.05, delay: 0.1 });
      },
      /* 激励音：单次点击累计消除 ≥3 → 上行琶音 + 八度冠音（v1.6.0），消得越多音越长 */
      streak(n) {
        const notes = [659, 784, 988, 1319, 1568];
        const cnt = Math.min(3 + Math.floor((n - 3) / 2), 5);
        for (let i = 0; i < cnt; i++) {
          tone(notes[i], 0.13, { type: 'triangle', gain: 0.09, delay: i * 0.075 });
        }
        tone(notes[cnt - 1] * 2, 0.22, { type: 'sine', gain: 0.07, delay: cnt * 0.075 });
      },
      win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: 'triangle', gain: 0.1, delay: i * 0.11 })); },
      lose() { [330, 262, 208].forEach((f, i) => tone(f, 0.24, { type: 'sine', gain: 0.1, delay: i * 0.14 })); },
      /* v1.7.0 正确落位确认音：上行大六度双击铃 + 高八度泛音——
       * 与落子/命中/喝彩音色错开，一听就知道「这步走在最优路上」 */
      correct() {
        tone(1318, 0.1, { type: 'sine', gain: 0.09 });
        tone(1976, 0.16, { type: 'sine', gain: 0.08, delay: 0.085 });
        tone(2637, 0.12, { type: 'triangle', gain: 0.04, delay: 0.17 });
      },
      /* v1.7.0 三连胜里程碑礼赞：上行琶音 + 双八度冠音 + 金色 shimmer */
      streakWin() {
        [523, 659, 784, 1047, 1568].forEach((f, i) => tone(f, 0.16, { type: 'triangle', gain: 0.1, delay: i * 0.09 }));
        tone(2093, 0.3, { type: 'sine', gain: 0.06, delay: 0.45 });
        tone(2637, 0.24, { type: 'sine', gain: 0.04, delay: 0.62 });
        noise(0.5, { from: 6000, to: 2200, gain: 0.05, delay: 0.45 });
      }
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

  /* v1.7.0 三连胜烟花：视口随机位置的多轮辐射爆裂（粒子按角度飞散 + 辉光拖尾） */
  function fireworks() {
    if (REDUCED_MOTION) return;
    const colors = ['#ff8a3d', '#f5b31a', '#4fa3d1', '#9b59d0', '#e8542d', '#3aa76d'];
    for (let b = 0; b < 6; b++) {
      setTimeout(() => {
        const host = document.createElement('div');
        host.className = 'firework';
        host.style.left = (12 + Math.random() * 76) + 'vw';
        host.style.top = (10 + Math.random() * 48) + 'vh';
        const hue = colors[(Math.random() * colors.length) | 0];
        const n = 10 + ((Math.random() * 4) | 0);
        for (let p = 0; p < n; p++) {
          const ang = (Math.PI * 2 * p) / n + Math.random() * 0.4;
          const far = 56 + Math.random() * 84;
          const dot = document.createElement('i');
          dot.style.setProperty('--dx', (Math.cos(ang) * far).toFixed(1) + 'px');
          dot.style.setProperty('--dy', (Math.sin(ang) * far).toFixed(1) + 'px');
          dot.style.setProperty('--fc', hue);
          dot.style.animationDelay = (Math.random() * 0.08).toFixed(2) + 's';
          host.appendChild(dot);
        }
        document.body.appendChild(host);
        setTimeout(() => host.remove(), 1400);
      }, b * 230 + Math.random() * 160);
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
  /* v1.7.0 播种位提示：虚线圈只画「接波位」——任一存活棋子波及范围内的空格
   * （与求解器的播种候选一致），指引有效落点，避免大盘满屏虚线的噪点。
   * 非接波位仍可正常播种（引擎不限制），只是不给提示。 */
  function plantSpots() {
    const covered = new Set();
    for (let i = 0; i < game.cells.length; i++) {
      if (game.cells[i] === 0) continue;
      for (const j of E.shapeTargets(game.size, i, E.kindOf(game.cells[i]))) {
        if (game.cells[j] === 0) covered.add(j);
      }
    }
    return covered;
  }
  function buildBoard() {
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = 'repeat(' + game.size + ', 1fr)';
    const spots = plantSpots();
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
      } else if (game.allowPlant && spots.has(i)) {
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
    const spots = plantSpots();
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
      cell.classList.toggle('plantable', v === 0 && game.allowPlant && !game.over && spots.has(i));
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

  /* v1.6.0 打击感：形状族配色（碎片/冲击波环与光点同族配色） */
  const FAM_COLOR = { 0: '#ff8a3d', 1: '#f5b31a', 2: '#4fa3d1', 3: '#9b59d0', 4: '#9b59d0', 5: '#9b59d0', 6: '#9b59d0', 7: '#3aa76d' };

  /* v1.6.0 形状定向碎片：碎片沿该形状的波及方向喷射——横线沿行、竖线沿列、
   * 三角朝角指方向、方框八向径向、普通十字米字。玩家能从碎片轨迹读出形状。 */
  function shardAngles(kind) {
    if (kind === 7) { const a = []; for (let k = 0; k < 8; k++) a.push(k * Math.PI / 4); return a; }
    if (kind === 1 || kind === 2) {
      const b = kind === 1 ? 0 : Math.PI / 2, a = [];
      for (const side of [0, Math.PI]) for (const off of [-.34, -.12, .12, .34]) a.push(b + side + off);
      return a;
    }
    const b = { 3: -Math.PI / 2, 4: Math.PI / 2, 5: Math.PI, 6: 0 }[kind];
    if (b !== undefined) return [b - .5, b - .22, b - .08, b + .08, b + .22, b + .5, 0, Math.PI];
    return [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4];
  }

  /* v1.6.0 冲击波环：分裂瞬间从棋子中心扩散一圈描边环（形状族配色）。
   * v1.6.2 方框源的环改方形轮廓（与震荡波呼应）。 */
  function shockwave(i, kind, rects, wrapRect) {
    const c = cellCenter(i, rects, wrapRect);
    const ring = document.createElement('div');
    ring.className = 'shockwave' + (kind === 7 ? ' sq' : '');
    ring.style.left = c.x + 'px';
    ring.style.top = c.y + 'px';
    ring.style.width = ring.style.height = (rects[i].width * 0.9) + 'px';
    ring.style.borderColor = FAM_COLOR[kind] || FAM_COLOR[0];
    boardWrap.appendChild(ring);
    setTimeout(() => ring.remove(), 500);
  }

  /* v1.6.0 顿帧闪光：重波落地时棋盘中央白光一闪 */
  function boardFlash() {
    const f = document.createElement('div');
    f.className = 'board-flash';
    boardWrap.appendChild(f);
    setTimeout(() => f.remove(), 260);
  }

  /* v1.6.0 弹字评价：按表现弹出大字喝彩（正反馈核心），
   * 新评价顶替旧评价（连锁逐级升格）。 */
  function praise(text, tier) {
    const old = boardWrap.querySelector('.praise');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'praise t' + tier;
    el.textContent = text;
    boardWrap.appendChild(el);
    sfx.praise(tier);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 950);
  }

  /* v1.6.0 剩余棋子倒计时脉冲：每波消除后数字弹一下、闪主题色 */
  function tickPieces(left) {
    piecesNum.textContent = String(left);
    piecesBadge.classList.remove('tick');
    void piecesBadge.offsetWidth;
    piecesBadge.classList.add('tick');
  }

  function blastPiece(i, kind, per, rects, wrapRect) {
    const cell = cellEl(i);
    const p = pieceEl(i);
    if (p) {
      p.classList.add('blast');
      setTimeout(() => p.remove(), 240);
    }
    shockwave(i, kind, rects, wrapRect);
    const c = cellCenter(i, rects, wrapRect);
    const angles = shardAngles(kind);
    const col = FAM_COLOR[kind] || FAM_COLOR[0];
    for (let k = 0; k < per; k++) {
      const shard = document.createElement('div');
      shard.className = 'shard';
      const ang = angles[(k + Math.floor(Math.random() * angles.length)) % angles.length] + (Math.random() - .5) * .18;
      const dist = 24 + Math.random() * 50;
      shard.style.left = (c.x - 3.5) + 'px';
      shard.style.top = (c.y - 3.5) + 'px';
      shard.style.background = Math.random() < .6 ? col : '#fff';
      boardWrap.appendChild(shard);
      void shard.offsetWidth;
      shard.style.transform = 'translate(' + Math.cos(ang) * dist + 'px,' + Math.sin(ang) * dist + 'px) rotate(' + (Math.random() * 220 - 110) + 'deg)';
      shard.style.opacity = '0';
      setTimeout(() => shard.remove(), 420);
    }
  }

  /* v1.6.1 命中爆闪：光束击中目标瞬间炸开一颗十字星（族色辉光） */
  function impactFlash(x, y, k) {
    const el = document.createElement('div');
    el.className = 'impact' + (SPARK_CLASS[k] ? ' ' + SPARK_CLASS[k] : '');
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    boardWrap.appendChild(el);
    setTimeout(() => el.remove(), 320);
  }

  /* v1.6.3 贯穿激光刀：同一爆源的所有目标共享一组「刀」——按形状一次开出贯穿光路：
   * 十字=整行+整列四向全刀（贯穿全盘的十字光）、横线=整行一刀、竖线=整列一刀、
   * 三角=整行+半列的 T 形刀阵。刀锋冲出棋盘边缘（贯穿感），刀尖亮点沿线性扫射推进
   * ——扫过目标的瞬间即命中（爆闪 + 弹起），随后驻留发光、收细消散。
   * 充能(亮刀尖) → 扫射(线性) → 驻留 → 消散四段。
   * v1.6.4 单裂也开刀：有无目标都开光路（kind 由分裂者传入，不再取 boosts[0]），
   * 终波不再只有碎片飞散；刀锋收口——贯穿余量 0.45 格收窄到 0.1 格，不再大段冲出棋盘。 */
  function flyLaser(from, kind, boosts, rects, wrapRect) {
    return new Promise(resolve => {
      const a = cellCenter(from, rects, wrapRect);
      const k = kind;
      const size = Math.round(Math.sqrt(rects.length));
      const r = (from / size) | 0, c = from % size;
      const cell = rects[from].width;
      const half = cell / 2;
      const over = cell * 0.1;           // 贯穿收口：刀尖略微出格即止
      /* 行列两端中心 → 四向刀全长（到棋盘边缘外 over） */
      const rowL = cellCenter(r * size, rects, wrapRect).x;
      const rowR = cellCenter(r * size + size - 1, rects, wrapRect).x;
      const colT = cellCenter(c, rects, wrapRect).y;
      const colB = cellCenter((size - 1) * size + c, rects, wrapRect).y;
      const pitch = size > 1 ? (rowR - rowL) / (size - 1) : cell;   // 格距（含缝）
      const fullLen = [a.x - (rowL - half - over), (rowR + half + over) - a.x,
                       a.y - (colT - half - over), (colB + half + over) - a.y];
      const charge = REDUCED_MOTION ? 20 : Math.max(25, LASER_CHARGE * animSpeed);
      const rate = REDUCED_MOTION ? 8 : Math.max(6, LASER_RATE * animSpeed);
      const hold = REDUCED_MOTION ? 40 : 70 * animSpeed;
      const fade = REDUCED_MOTION ? 60 : 180;
      /* 开刀方向：十字 LRUD（整行+整列）/ 横线 LR / 竖线 UD / 三角 LR+半列或 UD+半行 */
      const SHAPE_SIDES = { 0: [0, 1, 2, 3], 1: [0, 1], 2: [2, 3], 3: [0, 1, 2], 4: [0, 1, 3], 5: [2, 3, 0], 6: [2, 3, 1] };
      let sweepMax = 0;
      for (const s of (SHAPE_SIDES[k] || [0, 1, 2, 3])) {
        const len = fullLen[s];
        sweepMax = Math.max(sweepMax, len / pitch * rate);
        const beam = document.createElement('div');
        beam.className = 'beam' + (SPARK_CLASS[k] ? ' ' + SPARK_CLASS[k] : '');
        beam.style.left = a.x + 'px';
        beam.style.top = a.y + 'px';
        beam.style.width = Math.max(len, 6) + 'px';
        beam.style.opacity = '0';       /* 基础隐藏：WAAPI 缺失/结束时都不闪跳 */
        boardWrap.appendChild(beam);
        const sweep = len / pitch * rate;
        const total = charge + sweep + hold + fade;
        const rot = 'rotate(' + [Math.PI, 0, -Math.PI / 2, Math.PI / 2][s] + 'rad)';
        try {
          beam.animate([
            { transform: rot + ' scaleX(.05)', opacity: 0, easing: 'linear' },
            { transform: rot + ' scaleX(.05)', opacity: 1, offset: charge / total, easing: 'linear' }, /* 充能：刀尖亮起 */
            { transform: rot + ' scaleX(1)', opacity: 1, offset: (charge + sweep) / total },           /* 线性扫射到边 */
            { transform: rot + ' scaleX(1)', opacity: .9, offset: Math.min((charge + sweep + hold) / total, .96) },
            { transform: rot + ' scaleX(1) scaleY(.2)', opacity: 0 }                                   /* 收细消散 */
          ], { duration: total, fill: 'forwards' });
        } catch (e) { /* WAAPI 不可用则不显示 */ }
        setTimeout(() => beam.remove(), total + 40);
      }
      /* 刀尖扫过即命中：impact 按格距线性排布（与扫射动画同速推进） */
      for (const b of boosts) {
        setTimeout(() => {
          const c2 = cellCenter(b.to, rects, wrapRect);
          impactFlash(c2.x, c2.y, b.k);
          const p = pieceEl(b.to);
          if (p) {
            const next = Number(p.textContent) + 1;
            bumpPiece(b.to, Math.min(next, 3));
          }
        }, charge + b.dist * rate);
      }
      setTimeout(() => resolve(), charge + sweepMax + hold);
    });
  }

  /* v1.6.2 方框震荡波：方框爆开不走激光，而是从源扩散两圈方形震荡环（绿族）——
   * 方环外沿同时扫到边与角（与切比雪夫格距天然同步），环沿到达即全部命中
   * （十字星爆闪 + 弹起），第二圈延迟跟随制造「震荡」余波。
   * v1.6.3 修复：基础样式改为隐藏态 + fill:forwards——动画结束后保持终帧（透明），
   * 不再回退到未居中的全不透明状态（旧版 fill:backwards 会在移除前闪现错位方环）。
   * v1.6.5 修形：环改利落方形描边（去内阴影雾面）+ 余波环细一档、峰值淡一档，
   * 收尾缩短少拖影；环绘制在贴棋盘的裁剪容器（.ripple-clip）内——
   * 靠边的方框震荡波贴边截断，不再超出棋盘。 */
  function flyRipple(from, boosts, rects, wrapRect) {
    return new Promise(resolve => {
      const a = cellCenter(from, rects, wrapRect);
      const cell = rects[from].width;
      /* v1.6.4 单裂也开波：无目标时按 1 格扩散（方框波及半径恒为 1） */
      const maxDist = boosts.length ? Math.max.apply(null, boosts.map(b => b.dist)) : 1;
      const fire = REDUCED_MOTION ? 30 : Math.max(50, (RING_BASE + maxDist * RING_UNIT) * animSpeed);
      const hold = REDUCED_MOTION ? 40 : 70 * animSpeed;
      sfx.pulse();
      /* v1.6.5 波面裁剪：环只在棋盘范围内绘制（贴边截断） */
      const bRect = boardEl.getBoundingClientRect();
      const cx = bRect.left - wrapRect.left, cy = bRect.top - wrapRect.top;
      const clip = document.createElement('div');
      clip.className = 'ripple-clip';
      clip.style.left = cx + 'px';
      clip.style.top = cy + 'px';
      clip.style.width = bRect.width + 'px';
      clip.style.height = bRect.height + 'px';
      boardWrap.appendChild(clip);
      setTimeout(() => clip.remove(), fire + 480);
      for (let r = 0; r < 2; r++) {
        const ring = document.createElement('div');
        ring.className = 'ripple' + (r ? ' echo' : '');
        ring.style.left = (a.x - cx) + 'px';
        ring.style.top = (a.y - cy) + 'px';
        ring.style.width = ring.style.height = (cell * (2 * maxDist + 1.1)) + 'px';
        ring.style.opacity = '0';        /* 基础隐藏态：延迟期与结束后都不闪跳 */
        ring.style.transform = 'translate(-50%,-50%) scale(.15)';
        clip.appendChild(ring);
        const delay = REDUCED_MOTION || r === 0 ? 0 : 80;
        const dur = REDUCED_MOTION ? fire + 60 : fire + 170;
        const peak = r === 0 ? 1 : .5;   /* 主环亮，余波环淡一档 */
        try {
          ring.animate([
            { transform: 'translate(-50%,-50%) scale(.15)', opacity: 0, easing: 'cubic-bezier(.2,.8,.3,1)' },
            { transform: 'translate(-50%,-50%) scale(1)', opacity: peak, offset: Math.min(fire / dur, .82) },
            { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }
          ], { duration: dur, delay, fill: 'forwards' });
        } catch (e) { /* WAAPI 不可用则保持隐藏 */ }
        setTimeout(() => ring.remove(), dur + delay + 60);
      }
      /* 环沿扫过邻域：全部同时命中（方环外沿同时到达边与角） */
      setTimeout(() => {
        for (const b of boosts) {
          const c = cellCenter(b.to, rects, wrapRect);
          impactFlash(c.x, c.y, b.k);
          const p = pieceEl(b.to);
          if (p) {
            const next = Number(p.textContent) + 1;
            bumpPiece(b.to, Math.min(next, 3));
          }
        }
      }, fire);
      setTimeout(() => resolve(), fire + hold);
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
    /* 数 DOM（此刻盘面 = 投点后、逐波消除前的样子；game 已是终态不可用）。
     * 终值由 onMoveDone 的 syncBoard 校准。 */
    let piecesLeft = boardEl.querySelectorAll('.piece').length;

    for (let w = 0; w < trace.waves.length; w++) {
      const wave = trace.waves[w];
      const waveN = w + 1;
      const n = wave.splits.length;
      /* v1.6.4 波形分流：按分裂者开光路——有无目标都开（单裂也有光）：
       * 方框走震荡波，其余开贯穿刀；同一爆源的目标共享一组刀（整行/整列/T 形刀阵） */
      const boostsBySrc = new Map();
      for (const b of wave.boosts) {
        if (!boostsBySrc.has(b.from)) boostsBySrc.set(b.from, []);
        boostsBySrc.get(b.from).push(b);
      }
      if (w >= 1) {
        chainBadge.textContent = '连锁 ×' + waveN;
        chainBadge.classList.remove('hidden', 't2', 't3');
        const tier = waveN >= 5 ? 't3' : waveN >= 3 ? 't2' : '';
        if (tier) chainBadge.classList.add(tier);
        void chainBadge.offsetWidth;
        chainBadge.style.animation = 'none';
        void chainBadge.offsetWidth;
        chainBadge.style.animation = '';
        /* v1.6.0 震屏分级：连锁越高震得越狠 */
        const shakeCls = waveN >= 5 ? 's3' : waveN >= 3 ? 's2' : 's1';
        boardWrap.classList.remove('s1', 's2', 's3');
        void boardWrap.offsetWidth;
        boardWrap.classList.add(shakeCls);
        setTimeout(() => boardWrap.classList.remove(shakeCls), 340);
        chainShown = true;
      }
      sfx.wave(waveN);
      sfx.boom();
      if (wave.splits.some(sp => sp.kind !== 7)) sfx.zap();  /* 电光音只配激光；方框的震荡低鸣在 flyRipple 内 */
      if (n >= 2) sfx.cheer(n);

      /* v1.6.0 碎片预算：波内分裂过多时每颗减料，保住移动端帧率 */
      const per = n > 12 ? 4 : 7;
      for (const sp of wave.splits) {
        blastPiece(sp.index, sp.kind, per, rects, wrapRect);
      }
      tickPieces(Math.max(0, piecesLeft - n));
      piecesLeft -= n;

      const flights = [];
      for (const sp of wave.splits) {
        const list = boostsBySrc.get(sp.index) || [];
        flights.push(sp.kind === 7
          ? flyRipple(sp.index, list, rects, wrapRect)
          : flyLaser(sp.index, sp.kind, list, rects, wrapRect));
      }
      await Promise.all(flights);
      await wait(130 * animSpeed);

      /* v1.6.0 弹字评价：波落地即喝彩（连锁逐级升格顶替） */
      if (waveN >= 5) praise('史诗连锁！', 3);
      else if (waveN >= 3) praise('漂亮！', 2);
      else if (n >= 3) praise('妙！', 2);
      else if (n === 2) praise('双消！', 1);

      /* v1.6.0 顿帧：重波（多消或深连锁）落地后微停 + 棋盘闪光，下一波爆得更响 */
      if ((n >= 3 || waveN >= 3) && w + 1 < trace.waves.length) {
        boardFlash();
        await wait(70 * animSpeed);
      }
    }

    if (chainShown) {
      await wait(120 * animSpeed);
      chainBadge.classList.add('hidden');
    }
    /* v1.6.0 收官喝彩：一次点击累计消除 ≥6 → 神之一手 */
    if (trace.splits >= 6) praise('神之一手！', 4);
    if (trace.splits >= 3) sfx.streak(trace.splits);
    busy = false;
  }

  /* ================= 游戏流程 ================= */
  /* 形状/能力首登场说明（v1.5.0）：每种新棋子出现前先讲清楚玩法 */
  const DEBUT_COACH = {
    '1-1': '棋盘上的圆点是棋子，数字是点数。点数到 4 就会爆炸！点击一颗 3 点棋子，给它 +1。',
    '2-1': '新形状 ▬ 横线棋子：爆开时冲击波只扫同一横行，纵列不动。点满 4 点一样会炸。',
    '2-2': '新形状 ▮ 竖线棋子：爆开时冲击波只灌同一纵列，横行不动。横竖差别要看清。',
    '3-1': '新形状 ▲ 三角棋子：爆开扫整行，再向角指的方向伸出半列——T 字形波。角朝哪，波就伸向哪。',
    '4-1': '新形状 ■ 方框棋子：爆开只轰自己周围一圈（8 个邻格）。范围小，位置却最讲究。',
    '6-1': '新能力「播种」：点空格放下一颗 1 点棋子。种子接住两道冲击波就会爆——先布局，再引爆。'
  };
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
    const debut = DEBUT_COACH[lv.id];
    if (debut) coachShow(debut);
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
      if (r.error === 'empty-no-plant') msg('空格放不了棋子——本关不可播种');
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
    if (!game.over) {
      checkMoveQuality();   /* v1.7.0 正确落位音效反馈 */
      return;
    }
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

  /* v1.7.0 正确落位音效反馈：落子后局面仍能按最优（三星）路径清盘（剩余最少投点数
   * ≤ par - 已投点数）→ 播明显的确认音。求解超时 / 已偏离最优 / 必败都不响。
   * 延迟 90ms 再算，让棋盘先完成重绘；轻预算后台求解不卡手。 */
  function checkMoveQuality() {
    if (!level || game.over) return;
    const parLeft = level.par - game.placed;
    if (parLeft < 0) return;           /* 已超最优，后面怎么打都不是三星路径 */
    setTimeout(() => {
      if (!game || game.over || busy) return;
      let res = null;
      try { res = S.solve(game, { timeBudget: 280 }); } catch (e) { return; }
      if (res && !res.timeout && res.depth <= parLeft) sfx.correct();
    }, 90);
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
  function showOverlay(html, cls) {
    overlayBox.innerHTML = html;
    overlayBox.className = 'overlay-box' + (cls ? ' ' + cls : '');
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

  /* ================= v1.7.0 连胜（跨局持久化：胜 +1、败清零） ================= */
  function bumpStreak() {
    progress.streak = (progress.streak || 0) + 1;
    if (progress.streak > (progress.bestStreak || 0)) progress.bestStreak = progress.streak;
    saveProgress();
    return progress.streak;
  }
  function resetStreak() {
    if (progress.streak) {
      progress.streak = 0;
      saveProgress();
    }
  }
  const CN_STREAK = { 3: '三', 6: '六', 9: '九', 12: '十二', 15: '十五', 18: '十八', 21: '二十一' };
  const streakTitle = n => (CN_STREAK[n] || n) + '连胜！';
  /* 里程碑（每 3 连胜）时胜利弹窗升级为金色烟花庆典：皇冠 + 大标题 + 战绩行 */
  function streakHead(streak) {
    return '<div class="streak-crown">👑</div>' +
      '<h2 class="win streak-title">' + streakTitle(streak) + '</h2>' +
      '<div class="streak-sub">连续通关 ' + streak + ' 关 · 历史最佳 ' + (progress.bestStreak || streak) + ' 关</div>';
  }

  function showWin() {
    const stars = starFor(level, game.placed);
    const prev = progress.stars[level.id] || 0;
    progress.stars[level.id] = Math.max(prev, stars);
    const streak = bumpStreak();
    const milestone = streak % 3 === 0;   /* v1.7.0 每 3 连胜升级为金色烟花庆典 */
    saveProgress();
    if (milestone) {
      sfx.streakWin();
      fireworks();
    } else {
      sfx.win();
    }
    if (stars === 3) confetti();
    const isLast = levelIdx === LEVELS.length - 1;
    showOverlay(
      (milestone ? streakHead(streak) : '<h2 class="win">清空棋盘！</h2>') +
      starsPanelHtml(stars) +
      '<div class="stats">投点 ' + game.placed + ' / 最优 ' + level.par +
      ' · 最大连锁 ' + Math.max(maxChain, 1) + ' 波 · 剩余 ' + game.bank + ' 点</div>' +
      '<div class="actions">' +
      (isLast ? '<button class="ctl primary" id="ov-menu">通关！回菜单</button>'
              : '<button class="ctl primary" id="ov-next">下一关 →</button>') +
      '<button class="ctl" id="ov-retry">再玩一次</button>' +
      (isLast ? '' : '<button class="ctl" id="ov-menu">回菜单</button>') +
      '</div>',
      milestone ? 'streak' : ''
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
    const streak = bumpStreak();
    const milestone = streak % 3 === 0;   /* v1.7.0 每 3 连胜升级为金色烟花庆典 */
    if (milestone) {
      sfx.streakWin();
      fireworks();
    } else {
      sfx.win();
    }
    if (stars === 3) confetti();
    showOverlay(
      (milestone ? streakHead(streak) : '<h2 class="win">第 ' + passed + ' 关通过！</h2>') +
      starsPanelHtml(stars) +
      '<div class="stats">本关投点 ' + game.placed + ' / 最优 ' + level.par +
      ' · 本轮最大连锁 ' + Math.max(runCtx.runMaxChain, 1) + ' 波</div>' +
      '<div class="actions">' +
      '<button class="ctl primary" id="ov-next">下一关 →</button>' +
      '<button class="ctl" id="ov-menu">见好就收，回菜单</button>' +
      '</div>',
      milestone ? 'streak' : ''
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
    resetStreak();                       /* v1.7.0 连胜清零 */
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
    const streak = bumpStreak();
    const milestone = streak % 3 === 0;   /* v1.7.0 每 3 连胜升级为金色烟花庆典 */
    if (milestone) {
      sfx.streakWin();
      fireworks();
    } else {
      sfx.win();
    }
    if (stars === 3) confetti();
    showOverlay(
      (milestone ? streakHead(streak) : '<h2 class="win">今日挑战完成</h2>') +
      starsPanelHtml(stars) +
      '<div class="stats">投点 ' + game.placed + ' / 最优 ' + level.par +
      ' · 最大连锁 ' + Math.max(maxChain, 1) + ' 波<br>星数取当天最佳，可随时重打。</div>' +
      '<div class="actions">' +
      '<button class="ctl primary" id="ov-retry">再打一次</button>' +
      '<button class="ctl" id="ov-menu">回菜单</button>' +
      '</div>',
      milestone ? 'streak' : ''
    );
    $('ov-retry').addEventListener('click', () => { closeOverlay(); resetLevel(); });
    $('ov-menu').addEventListener('click', () => { closeOverlay(); goMenu(); });
  }

  function showLose() {
    sfx.lose();
    resetStreak();                       /* v1.7.0 连胜清零 */
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
