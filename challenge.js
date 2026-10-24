/* 十字连爆 · chess-crash — 无限挑战与每日挑战的运行时关卡生成
 *
 * 与 tools/generate-levels.cjs 共用同一套棋盘随机化思路：
 * 按难度配方随机布局 → solver 验证最优投点数恰好等于目标 par → 收录；
 * 不达标换盘重试（总预算保护，超时返回 null 由界面提示重试）。
 *
 * 无限挑战：一关接一关，难度随 stage 递增（棋盘变大、手牌收紧），
 * 失败即结算——跑分结构，与战役的背板结构互补。
 * 每日挑战：日期做种子的确定性关卡，同一天全站同款。
 */
(function (root, factory) {
  'use strict';
  const engineRef = (typeof module !== 'undefined' && module.exports)
    ? require('./engine.js')
    : root.CC_ENGINE;
  const solverRef = (typeof module !== 'undefined' && module.exports)
    ? require('./solver.js')
    : root.CC_SOLVER;
  const api = factory(engineRef, solverRef);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CC_CHALLENGE = api;
})(typeof self !== 'undefined' ? self : globalThis, function (engine, solver) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickCount(weights, rnd) {
    const total = weights[0] + weights[1] + weights[2];
    let x = rnd() * total;
    if (x < weights[0]) return 1;
    if (x < weights[0] + weights[1]) return 2;
    return 3;
  }

  function randomBoard(size, targetB, weights, lineBias, rnd, kindOpts) {
    const kinds = (kindOpts && kindOpts.pool) || [];
    const kindShare = (kindOpts && kindOpts.share) || 0;
    const cells = new Set();
    const lineCount = Math.round(targetB * (lineBias || 0));
    if (lineCount > 0) {
      const lines = [];
      const nLines = Math.min(size, 2 + Math.floor(rnd() * 2));
      for (let k = 0; k < nLines; k++) {
        lines.push({ horizontal: rnd() < 0.5, pos: Math.floor(rnd() * size) });
      }
      for (let k = 0; k < lineCount; k++) {
        const line = lines[Math.floor(rnd() * lines.length)];
        const t = Math.floor(rnd() * size);
        cells.add(line.horizontal ? line.pos * size + t : t * size + line.pos);
      }
    }
    while (cells.size < targetB) {
      cells.add(Math.floor(rnd() * size * size));
    }
    // 家族保底：池内每个形状家族先随机钉一颗（不放回），其余按 kindShare 随机
    let forced = null;
    if (kinds.length) {
      const fams = [...new Set(kinds)];
      const spots = [...cells];
      forced = new Map();
      for (const fam of fams) {
        const t = Math.floor(rnd() * spots.length);
        forced.set(spots[t], fam);
        spots.splice(t, 1);
      }
    }
    const rows = [];
    for (let r = 0; r < size; r++) {
      let row = '';
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        if (!cells.has(idx)) { row += '.'; continue; }
        const p = pickCount(weights, rnd);
        const ff = forced ? forced.get(idx) : undefined;
        const fam = ff !== undefined ? ff
          : (kinds.length && rnd() < kindShare ? kinds[Math.floor(rnd() * kinds.length)] : 0);
        row += fam ? engine.CELL_CHARS[fam][p - 1] : String(p);
      }
      rows.push(row);
    }
    return rows;
  }

  /* 难度曲线：棋盘 6→9 逐步放大，par 1→6，手牌从 +2 宽松收到恰好等于 par；
   * 形状混入随 stage 递进：6 起横竖线、10 起三角、14 起方框全开。
   * 特殊棋覆盖面小于十字，按比例削减棋子数作形状补偿（证无解更快、命中更稳）。 */
  function stageSpec(stage) {
    const size = stage < 5 ? 6 : stage < 10 ? 7 : stage < 16 ? 8 : 9;
    const par = Math.min(1 + Math.floor((stage + 1) / 3), 6);
    const maxB = Math.floor(size * size * 0.34);
    let targetB = Math.min(6 + Math.round(stage * 1.4), maxB);
    const weights = stage < 3 ? [1, 2, 4] : stage < 12 ? [1, 2, 2] : [2, 2, 1];
    const bankPad = stage < 5 ? 2 : stage < 10 ? 1 : 0;
    const lineBias = stage >= 6 ? 0.55 : 0.35;
    const kinds = stage < 6 ? [] : stage < 10 ? [1, 2] : stage < 14 ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 7];
    const kindShare = stage < 6 ? 0 : stage < 10 ? 0.3 : 0.35;
    if (kinds.length) {
      const comp = stage < 10 ? 0.92 : stage < 14 ? 0.85 : stage < 16 ? 0.8 : 0.65;
      targetB = Math.max(6, Math.round(targetB * comp));
    }
    return { size, par, targetB, weights, bankPad, lineBias, kinds, kindShare };
  }

  const STAGE_TITLES = ['热身', '起势', '连击', '入门', '渐入', '紧凑', '顺手', '进阶', '布局', '沉稳',
    '老练', '精算', '行家', '刁钻', '大师', '严苛', '极限', '深渊'];

  /* makeChallenge(stage, seed, { attempts, budget, totalBudget })
   * → 关卡对象（与 levels.js 的关卡同构）| null（预算内未生成）。
   * 首轮用原始种子（同种子同关卡，确定性）；未中则预算内扰动种子轮换再试，
   * 深关（大棋盘 + 混形状）偶发难命中时靠轮换兜底。 */
  function makeChallenge(stage, seed, opts) {
    opts = opts || {};
    const spec = stageSpec(stage);
    const bank = spec.par + spec.bankPad;
    const attempts = opts.attempts || 140;
    const totalBudget = opts.totalBudget || 20000;
    const roundBudget = Math.max(1000, Math.floor(totalBudget / 4));
    const t0 = Date.now();
    let s = seed >>> 0;
    for (let round = 0; round < 8; round++) {
      const roundEnd = Math.min(t0 + totalBudget, Date.now() + roundBudget);
      const rnd = mulberry32(s * 7919 + stage * 104729 + 17);
      for (let a = 0; a < attempts; a++) {
        if (Date.now() > roundEnd) break;
        const board = randomBoard(spec.size, spec.targetB, spec.weights, spec.lineBias, rnd,
          { pool: spec.kinds, share: spec.kindShare });
        const game = engine.newGame({ size: spec.size, board, bank, allowPlant: false });
        const res = solver.solve(game, { timeBudget: opts.budget || 1200 });
        if (res && !res.timeout && res.depth === spec.par) {
          const title = STAGE_TITLES[Math.min(stage, STAGE_TITLES.length - 1)];
          return {
            id: 'C' + stage,
            mode: 'challenge',
            chapter: 0,
            title: title + ' · 第 ' + (stage + 1) + ' 关',
            intro: stage === 0
              ? '无限挑战：一关接一关，越打越紧，失败即结算。'
              : (spec.kinds.length ? '特殊形状登场：看清每颗的波及形状再投点。' : '继续，别停。'),
            size: spec.size,
            bank: bank,
            par: res.depth,
            allowPlant: false,
            board: board
          };
        }
      }
      if (Date.now() - t0 > totalBudget) break;
      s = (s ^ 0x9E3779B9) + 0x85EBCA6B;
    }
    return null;
  }

  /* 每日挑战：日期决定难度档与种子，同一天全站同款 */
  function dailyStage(date) {
    const start = new Date(date.getFullYear(), 0, 0);
    const doy = Math.floor((date - start) / 86400000);
    return [4, 8, 12, 6, 10, 14, 16][doy % 7];
  }

  function dateKey(date) {
    const p = n => (n < 10 ? '0' : '') + n;
    return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
  }

  function makeDaily(date) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const seed = y * 10000 + m * 100 + d;
    const lv = makeChallenge(dailyStage(date), seed, { attempts: 320, budget: 2500, totalBudget: 20000 });
    if (lv) {
      lv.id = 'D' + seed;
      lv.mode = 'daily';
      lv.title = '每日挑战';
      lv.intro = '今天的关卡全站同款——一天一关，星数取当天最佳。';
    }
    return lv;
  }

  return { mulberry32, stageSpec, makeChallenge, makeDaily, dailyStage, dateKey, randomBoard };
});
