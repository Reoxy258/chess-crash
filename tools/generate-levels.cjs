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
const CH6 = '第六章 · 综合爆发';
const CH7 = '第七章 · 直线风暴';
const CH8 = '第八章 · T 形三锋';
const CH9 = '第九章 · 方阵内爆';
const CH10 = '终章 · 万形齐发';

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

  // 第六章：综合爆发（大棋盘、混合手法）
  { id: '6-1', chapter: 6, title: '大棋盘', intro: '更大的战场，波及全场。', size: 8, bank: 5, par: 4, targetB: 20, weights: [1, 2, 2] },
  { id: '6-2', chapter: 6, title: '全面战争', intro: '火力全开。', size: 8, bank: 6, par: 5, targetB: 22, weights: [1, 2, 2] },
  { id: '6-3', chapter: 6, title: '最后的预算', intro: '手牌又紧了。', size: 9, bank: 6, par: 5, targetB: 24, weights: [1, 2, 1] },
  { id: '6-4', chapter: 6, title: '精确打击', intro: '每一颗都算好。', size: 9, bank: 5, par: 5, targetB: 22, weights: [1, 2, 1] },
  { id: '6-5', chapter: 6, title: '终局', intro: '三十关的最后一爆。', size: 9, bank: 6, par: 6, targetB: 24, weights: [1, 2, 1] },

  // 第七章：直线风暴（横线 ▬ 只扫整行 / 竖线 ▮ 只灌整列）
  { id: '7-1', chapter: 7, title: '横扫千军', intro: '新形状 ▬ 横线：爆开只扫同一横行。', size: 6, bank: 1, par: 1, fixed: ['......', '.C333.', '......', '......', '......', '......'] },
  { id: '7-2', chapter: 7, title: '纵贯线', intro: '新形状 ▮ 竖线：爆开只灌同一纵列。', size: 6, bank: 1, par: 1, fixed: ['...F..', '...3..', '...3..', '...3..', '...3..', '......'] },
  { id: '7-3', chapter: 7, title: '直来直往', intro: '横竖混编：看清每颗的扫法再投点。', size: 6, bank: 3, par: 2, targetB: 10, weights: [1, 2, 3], kinds: [1, 2], kindShare: 0.4 },
  { id: '7-4', chapter: 7, title: '一线生机', intro: '一条直线，救活全局。', size: 7, bank: 4, par: 3, targetB: 14, weights: [1, 2, 2], kinds: [1, 2], kindShare: 0.45 },
  { id: '7-5', chapter: 7, title: '笔直的愤怒', intro: '章末考核：直线与十字共舞。', size: 7, bank: 5, par: 3, targetB: 16, weights: [1, 2, 2], kinds: [1, 2], kindShare: 0.5, lineBias: 0.5 },

  // 第八章：T 形三锋（三角 ▲▼◀▶：整行/列 + 角朝半臂）
  { id: '8-1', chapter: 8, title: 'T 字教头', intro: '新形状 ▲ 三角：爆开扫整行，再加角朝方向的半列——T 字形。', size: 6, bank: 1, par: 1, fixed: ['...3..', '.3.I3.', '......', '......', '......', '......'] },
  { id: '8-2', chapter: 8, title: '朝向的艺术', intro: '三角看朝向：角指哪边，T 就伸向哪边。', size: 6, bank: 4, par: 2, targetB: 10, weights: [1, 2, 3], kinds: [3, 4, 5, 6], kindShare: 0.5 },
  { id: '8-3', chapter: 8, title: '三锋阵', intro: '让几个方向的锋刃同时出鞘。', size: 7, bank: 5, par: 3, targetB: 14, weights: [1, 2, 2], kinds: [3, 4, 5, 6], kindShare: 0.45 },
  { id: '8-4', chapter: 8, title: '锋线交叠', intro: 'T 与十字交叠，波网更密。', size: 7, bank: 5, par: 4, targetB: 16, weights: [1, 2, 2], kinds: [3, 4, 5, 6], kindShare: 0.4, lineBias: 0.4 },
  { id: '8-5', chapter: 8, title: '锋芒毕露', intro: '章末考核：四面三角齐发。', size: 8, bank: 5, par: 4, targetB: 18, weights: [1, 2, 2], kinds: [3, 4, 5, 6], kindShare: 0.5, lineBias: 0.45 },

  // 第九章：方阵内爆（方框 ■：周围一圈 8 邻域）
  { id: '9-1', chapter: 9, title: '内爆光环', intro: '新形状 ■ 方框：爆开只轰自己周围一圈。', size: 6, bank: 1, par: 1, fixed: ['......', '.333..', '.3U3..', '.333..', '......', '......'] },
  { id: '9-2', chapter: 9, title: '连环马', intro: '一个圈的火种，引燃下一个。', size: 6, bank: 3, par: 2, targetB: 10, weights: [1, 2, 3], kinds: [7], kindShare: 0.4 },
  { id: '9-3', chapter: 9, title: '蜂窝矩阵', intro: '方框相邻成网，一爆传一爆。', size: 7, bank: 5, par: 3, targetB: 14, weights: [1, 2, 2], kinds: [7], kindShare: 0.45 },
  { id: '9-4', chapter: 9, title: '圈内圈外', intro: '够不着的棋子，得另想办法。', size: 7, bank: 5, par: 4, targetB: 16, weights: [1, 2, 2], kinds: [7], kindShare: 0.4 },
  { id: '9-5', chapter: 9, title: '天罗地网', intro: '章末考核：方阵 + 直线 + 十字。', size: 8, bank: 6, par: 4, targetB: 18, weights: [1, 2, 2], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.45 },

  // 终章二：万形齐发（全部形状混合）
  { id: '10-1', chapter: 10, title: '万形登场', intro: '所有形状同场：十字、直线、三角、方框。', size: 8, bank: 5, par: 4, targetB: 18, weights: [1, 2, 2], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },
  { id: '10-2', chapter: 10, title: '形状协奏', intro: '让每种形状都发一次力。', size: 8, bank: 6, par: 5, targetB: 20, weights: [1, 2, 2], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.45 },
  { id: '10-3', chapter: 10, title: '大衍阵', intro: '九路棋盘，万形齐张。', size: 9, bank: 6, par: 5, targetB: 22, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },
  { id: '10-4', chapter: 10, title: '最后的杠杆', intro: '手牌压到最低，形状是唯一的杠杆。', size: 9, bank: 5, par: 5, targetB: 20, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },
  { id: '10-5', chapter: 10, title: '终局·万象归一', intro: '五十关的最后一爆：万形齐发，一炸到底。', size: 9, bank: 6, par: 6, targetB: 24, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.5 }
];

const CHAPTERS = { 1: CH1, 2: CH2, 3: CH3, 4: CH4, 5: CH5, 6: CH6, 7: CH7, 8: CH8, 9: CH9, 10: CH10 };

/* ---------------- 随机棋盘 ---------------- */
function pickCount(weights, rnd) {
  const total = weights[0] + weights[1] + weights[2];
  let x = rnd() * total;
  if (x < weights[0]) return 1;
  if (x < weights[0] + weights[1]) return 2;
  return 3;
}

/* 生成一个格子字符：先掷点数，再决定形状——
 * · 钉子格（家族保底）直接用指定家族；
 * · 其余按 kindShare 概率抽池内家族，否则普通十字。
 * 短路写法保证：无 kinds 的旧配方不消耗任何额外随机数
 * （seed 相同时旧 30 关棋盘逐字节复现）。 */
function cellChar(spec, kinds, kindShare, rnd, forcedFam) {
  const p = pickCount(spec.weights, rnd);
  const fam = forcedFam !== undefined
    ? forcedFam
    : (kinds.length && rnd() < kindShare ? kinds[Math.floor(rnd() * kinds.length)] : 0);
  return fam ? engine.CELL_CHARS[fam][p - 1] : String(p);
}

function randomBoard(spec, rnd) {
  const { size, targetB } = spec;
  const cells = new Set();
  const kinds = spec.kinds || [];
  const kindShare = spec.kindShare || 0;
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
  // 家族保底（混形关）：池内每个家族先随机钉一颗（不放回），其余按 kindShare 随机
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
  for (let r = 0; r < size; r++) {
    let row = '';
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      row += cells.has(idx) ? cellChar(spec, kinds, kindShare, rnd, forced ? forced.get(idx) : undefined) : '.';
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
