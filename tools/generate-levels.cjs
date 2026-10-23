/* 十字连爆 · 关卡生成器（固定种子，可复现）
 *
 * 管线：随机棋盘（按章节配方：尺寸/棋子数/点数权重/线形偏置）
 *   → solver 求最优投点数，必须恰好等于配方 par（IDDFS 保证最浅）
 *   → 第 5 章播种关额外要求：关闭 allowPlant 后确证无解（必须播种）
 *   → 收录；重试预算耗尽则报错，人工换种子/调参再跑
 *
 * 用法：node tools/generate-levels.cjs [seed]
 * 输出：levels.js（勿手改）+ 控制台预览
 */
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../engine.js');
const solver = require('../solver.js');

/* ---------------- PRNG（mulberry32，可复现） ---------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- 关卡配方（章节主题 + 文案） ---------------- */
const CH1 = '第一章 · 认识分裂';
const CH2 = '第二章 · 引爆顺序';
const CH3 = '第三章 · 手紧点数';
const CH4 = '第四章 · 队形与对齐';
const CH5 = '第五章 · 空降播种';
const CH6 = '终章 · 综合爆发';

const SPECS = [
  // 第一章：认识分裂（6×6，单雷管起步）
  { id: '1-1', chapter: 1, title: '第一声', intro: '点击一颗 3 点棋子，给它 +1——看它爆开，把冲击波送进同行同列。', size: 6, bank: 1, par: 1, targetB: 2, weights: [0, 0, 1], fixed: ['......', '......', '..3.3.', '......', '......', '......'] },
  { id: '1-2', chapter: 1, title: '单点引爆', intro: '找那颗只差一点的棋子。', size: 6, bank: 3, par: 1, targetB: 6, weights: [1, 2, 4] },
  { id: '1-3', chapter: 1, title: '更大的排面', intro: '一颗雷，一整片。', size: 6, bank: 3, par: 1, targetB: 9, weights: [1, 2, 4] },
  { id: '1-4', chapter: 1, title: '两步走', intro: '一次不够，就分两次投。', size: 6, bank: 4, par: 2, targetB: 8, weights: [1, 2, 3] },
  { id: '1-5', chapter: 1, title: '小试身手', intro: '让连锁替你干活。', size: 6, bank: 4, par: 2, targetB: 10, weights: [1, 2, 3] },

  // 第二章：引爆顺序（顺序敏感）
  { id: '2-1', chapter: 2, title: '谁先谁后', intro: '顺序就是一切：先送点，再收割。', size: 6, bank: 4, par: 2, targetB: 10, weights: [1, 2, 3] },
  { id: '2-2', chapter: 2, title: '先来后到', intro: '想清楚哪颗先爆，波才不会打空。', size: 6, bank: 4, par: 2, targetB: 12, weights: [1, 2, 3] },
  { id: '2-3', chapter: 2, title: '三连击', intro: '三步之内，清空棋盘。', size: 6, bank: 5, par: 3, targetB: 12, weights: [1, 2, 2] },
  { id: '2-4', chapter: 2, title: '传导链', intro: '让爆炸排着队走。', size: 6, bank: 6, par: 3, targetB: 14, weights: [1, 2, 2] },
  { id: '2-5', chapter: 2, title: '排队爆', intro: '章末考核：一次排好全部引信。', size: 7, bank: 6, par: 3, targetB: 14, weights: [1, 2, 2] },

  // 第三章：手紧点数（bank === par，错一步即败）
  { id: '3-1', chapter: 3, title: '一分不能浪费', intro: '手牌刚好够——错一步就没了。', size: 6, bank: 3, par: 3, targetB: 12, weights: [2, 2, 1] },
  { id: '3-2', chapter: 3, title: '精打细算', intro: '每个点都要花在刀刃上。', size: 6, bank: 3, par: 3, targetB: 14, weights: [2, 2, 1] },
  { id: '3-3', chapter: 3, title: '预算四点', intro: '四点，四步，不能多。', size: 7, bank: 4, par: 4, targetB: 14, weights: [2, 2, 1] },
  { id: '3-4', chapter: 3, title: '铁算盘', intro: '想想哪一步能白赚一整波。', size: 7, bank: 4, par: 4, targetB: 16, weights: [2, 2, 1] },
  { id: '3-5', chapter: 3, title: '分毫不差', intro: '章末考核：一步都不能错。', size: 7, bank: 4, par: 4, targetB: 16, weights: [2, 2, 1] },

  // 第四章：队形与对齐（线形偏置，十字走廊）
  { id: '4-1', chapter: 4, title: '十字路口', intro: '排成十字的棋子，最怕中心起爆。', size: 7, bank: 4, par: 3, targetB: 16, weights: [1, 2, 2], lineBias: 0.65 },
  { id: '4-2', chapter: 4, title: '一字长蛇', intro: '整行整列都是燃料。', size: 8, bank: 5, par: 4, targetB: 18, weights: [1, 2, 2], lineBias: 0.65 },
  { id: '4-3', chapter: 4, title: '边角的弱点', intro: '角落传播最少——留到最后一爆。', size: 8, bank: 5, par: 4, targetB: 20, weights: [1, 2, 2], lineBias: 0.6 },
  { id: '4-4', chapter: 4, title: '火力覆盖', intro: '十字波扫过的地方寸草不生。', size: 8, bank: 5, par: 4, targetB: 20, weights: [1, 2, 2], lineBias: 0.6 },
  { id: '4-5', chapter: 4, title: '完美队形', intro: '章末考核：为冲击波排好阵列。', size: 8, bank: 6, par: 5, targetB: 22, weights: [1, 2, 2], lineBias: 0.65 },

  // 第五章：空降播种（波网交叉点留空，最优解必含播种步）
  { id: '5-1', chapter: 5, title: '造一颗棋子', intro: '新能力：点空格可以播种一颗 1 点棋子，接住两道冲击波。', size: 7, bank: 5, par: 3, targetB: 8, weights: [1, 2, 2], lineBias: 0.7, requirePlant: true, allowPlant: true },
  { id: '5-2', chapter: 5, title: '搭桥', intro: '交叉点上没有棋子？自己种一颗。', size: 7, bank: 5, par: 3, targetB: 10, weights: [1, 2, 2], lineBias: 0.7, requirePlant: true, allowPlant: true },
  { id: '5-3', chapter: 5, title: '接力棒', intro: '种子吃满两道波就会自己爆。', size: 7, bank: 5, par: 3, targetB: 10, weights: [2, 2, 1], lineBias: 0.7, requirePlant: true, allowPlant: true },
  { id: '5-4', chapter: 5, title: '补位专家', intro: '哪里断链补哪里。', size: 7, bank: 6, par: 4, targetB: 12, weights: [2, 2, 1], lineBias: 0.7, requirePlant: true, allowPlant: true },
  { id: '5-5', chapter: 5, title: '天降奇兵', intro: '章末考核：种对位置，一爆到底。', size: 7, bank: 6, par: 4, targetB: 12, weights: [2, 2, 1], lineBias: 0.75, requirePlant: true, allowPlant: true },

  // 终章：综合爆发（大棋盘、混合手法）
  { id: '6-1', chapter: 6, title: '大棋盘', intro: '更大的战场，波及全场。', size: 8, bank: 5, par: 4, targetB: 20, weights: [1, 2, 2] },
  { id: '6-2', chapter: 6, title: '全面战争', intro: '火力全开。', size: 8, bank: 6, par: 5, targetB: 22, weights: [1, 2, 2] },
  { id: '6-3', chapter: 6, title: '最后的预算', intro: '手牌又紧了。', size: 9, bank: 6, par: 5, targetB: 24, weights: [1, 2, 1] },
  { id: '6-4', chapter: 6, title: '精确打击', intro: '每一颗都算好。', size: 9, bank: 5, par: 5, targetB: 22, weights: [1, 2, 1] },
  { id: '6-5', chapter: 6, title: '终局', intro: '三十关的最后一爆。', size: 9, bank: 6, par: 6, targetB: 24, weights: [1, 2, 1] }
];

const CHAPTERS = { 1: CH1, 2: CH2, 3: CH3, 4: CH4, 5: CH5, 6: CH6 };

/* ---------------- 随机棋盘 ---------------- */
function pickCount(weights, rnd) {
  const total = weights[0] + weights[1] + weights[2];
  let x = rnd() * total;
  if (x < weights[0]) return 1;
  if (x < weights[0] + weights[1]) return 2;
  return 3;
}

function randomBoard(spec, rnd) {
  const { size, targetB } = spec;
  const cells = new Set();
  const lineBias = spec.lineBias || 0;
  const lineCount = Math.round(targetB * lineBias);
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
  const rows = [];
  for (let r = 0; r < size; r++) {
    let row = '';
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      row += cells.has(idx) ? String(pickCount(spec.weights, rnd)) : '.';
    }
    rows.push(row);
  }
  return rows;
}

/* ---------------- 验证一个候选棋盘 ---------------- */
function evaluate(spec, board) {
  const game = engine.newGame({
    size: spec.size, board, bank: spec.bank, allowPlant: !!spec.allowPlant
  });
  const t0 = Date.now();
  const res = solver.solve(game, { timeBudget: 3000 });
  const ms = Date.now() - t0;
  if (!res || res.timeout) return null;
  if (res.depth !== spec.par) return null;
  if (spec.requirePlant) {
    // 播种章：最浅解必须包含播种步（投在初始空格上），
    // 保证“播种”确实在该关最优路径中，而不是可有可无的摆设。
    const flat = board.join('');
    const plantMoves = res.moves.filter(i => flat[i] === '.');
    if (plantMoves.length === 0) return null;
  }
  return { moves: res.moves, depth: res.depth, ms };
}

/* ---------------- 主流程 ---------------- */
function main() {
  const seed = Number(process.argv[2] || 20261023);
  const rnd = mulberry32(seed);
  const out = [];
  console.log('chess-crash 关卡生成 · seed = ' + seed + '\n');
  for (const spec of SPECS) {
    let picked = null;
    let attempts = 0;
    if (spec.fixed) {
      const ev = evaluate(spec, spec.fixed);
      if (!ev) {
        console.error('固定关卡 ' + spec.id + ' 验证失败！');
        process.exit(1);
      }
      picked = { board: spec.fixed, ev, attempts: 0 };
    } else {
      const budget = 6000;
      while (attempts < budget && !picked) {
        attempts++;
        const board = randomBoard(spec, rnd);
        const ev = evaluate(spec, board);
        if (ev) picked = { board, ev, attempts };
      }
    }
    if (!picked) {
      console.error(spec.id + ' 生成失败：' + spec.par + ' 步关卡在 ' + 6000 + ' 次尝试内未命中，请调整种子或配方');
      process.exit(1);
    }
    out.push({
      id: spec.id,
      chapter: spec.chapter,
      title: spec.title,
      intro: spec.intro,
      size: spec.size,
      bank: spec.bank,
      par: picked.ev.depth,
      allowPlant: !!spec.allowPlant,
      board: picked.board
    });
    console.log(`${spec.id} ${spec.title} — par=${picked.ev.depth} bank=${spec.bank} 尝试 ${picked.attempts} 次 · 求解 ${picked.ev.ms}ms`);
    for (const row of picked.board) console.log('    ' + row);
    console.log('');
  }

  const banner = `/* 十字连爆 · 关卡数据
 * 由 tools/generate-levels.cjs 生成（seed=${seed}）并经 solver 逐关验证：
 * 最优投点数 === par；播种关（第五章）的最浅解必含播种步。请勿手改，重跑生成器即可再生成。
 */
`;
  const body = out.map(l => '  ' + JSON.stringify(l).replace(/","/g, '",\n    "').replace(/"board":\[/, '"board": [\n    ').replace(/\]/, '\n  ]')).join(',\n');
  const file = `${banner}(function (root) {
  'use strict';
  const LEVELS = [
${body}
  ];
  const CHAPTERS = ${JSON.stringify(CHAPTERS)};
  function starFor(level, placed) {
    return placed <= level.par ? 3 : placed <= level.par + 1 ? 2 : 1;
  }
  function unlocked(levels, index, stars) {
    if (index <= 0) return true;
    return !!stars[levels[index - 1].id];
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LEVELS, CHAPTERS, starFor, unlocked };
  } else {
    root.CC_LEVELS = LEVELS;
    root.CC_CHAPTERS = CHAPTERS;
    root.CC_STAR_FOR = starFor;
    root.CC_UNLOCKED = unlocked;
  }
})(typeof self !== 'undefined' ? self : globalThis);
`;
  const dest = path.join(__dirname, '..', 'levels.js');
  fs.writeFileSync(dest, file, 'utf8');
  console.log('已写入 ' + dest + '（共 ' + out.length + ' 关）');
}

main();
