/* 十字连爆 · chess-crash — 确定性规则引擎（浏览器 / 生成工具 / 测试共用）
 *
 * 规则核心：
 * - 棋盘上预填 1~3 点的棋子；玩家每回合消耗 1 点手牌，给一颗棋子 +1
 *   （第 5 章起允许把点数“播种”到空格，长出一颗 1 点新棋子）。
 * - 棋子达到 4 点即分裂：该棋子消失（全部点数湮灭），并按自身「形状」
 *   给波及范围内的所有存活棋子各 +1：
 *     · 普通（十字）：同一横行与纵列；
 *     · 横线 ▬：同一横行；
 *     · 竖线 ▮：同一纵列；
 *     · 三角 ▲▼◀▶：整行/整列 + 沿角朝方向的半列/半行（T 字形）；
 *     · 方框 ■：周围一圈 8 邻域。
 * - 同一波次内达到 4 的棋子同时分裂：分裂者先行移除、互不加成；
 *   存活者若同时被多道冲击波扫中则累加；达到 4（及以上）进入下一波。
 * - 棋子数单调递减、空格不自动生棋，连锁必然终止（MAX_WAVES 仅为保险丝）。
 * - 目标：清空棋盘所有棋子。手牌耗尽仍未清空即失败。
 *
 * 编码：cells[i] = (kind << 5) | points
 *   kind 0~7（见 KINDS），points 稳定态 1~3、瞬态可叠至 31（≥4 皆分裂）。
 *   棋盘字符：'1'~'3' 普通棋子；A-C 横线、D-F 竖线、G-I ▲、J-L ▼、
 *   M-O ◀、P-R ▶、S-U ■（各 1~3 点）；'.'/'0' 空格。旧数据（纯数字）全兼容。
 *
 * 状态不可变：applyMove 返回全新 state 与逐波 trace（含冲击波距离与形状类型，
 * 供前端按距离延迟播放演出）。
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CC_ENGINE = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const MAX_WAVES = 4096; // 理论上不可达，防御性保险丝

  const KINDS = { CROSS: 0, ROW: 1, COL: 2, TRI_U: 3, TRI_D: 4, TRI_L: 5, TRI_R: 6, SQ: 7 };
  const KIND_NAMES = ['cross', 'row', 'col', 'tri-u', 'tri-d', 'tri-l', 'tri-r', 'sq'];

  /* kind × points → 棋盘字符（kind 0 用数字，保持旧格式兼容） */
  const CELL_CHARS = [
    '123',    // 0 cross
    'ABC',    // 1 row
    'DEF',    // 2 col
    'GHI',    // 3 ▲
    'JKL',    // 4 ▼
    'MNO',    // 5 ◀
    'PQR',    // 6 ▶
    'STU'     // 7 ■
  ];
  const CHAR_TO_CELL = Object.create(null);
  for (let k = 0; k < 8; k++) {
    for (let p = 1; p <= 3; p++) {
      CHAR_TO_CELL[CELL_CHARS[k][p - 1]] = (k << 5) | p;
    }
  }
  const CELL_TO_CHAR = Object.create(null);
  for (const ch of Object.keys(CHAR_TO_CELL)) CELL_TO_CHAR[CHAR_TO_CELL[ch]] = ch;
  CELL_TO_CHAR[0] = '.';

  const pointsOf = v => v & 31;
  const kindOf = v => v >> 5;
  const encodeCell = (kind, points) => (kind << 5) | points;

  function parseBoard(board, size) {
    if (!Array.isArray(board) || board.length !== size) throw new Error('board rows mismatch');
    const cells = new Array(size * size).fill(0);
    for (let r = 0; r < size; r++) {
      const row = board[r];
      if (typeof row !== 'string' || row.length !== size) throw new Error('board row width mismatch');
      for (let c = 0; c < size; c++) {
        const ch = row[c];
        if (ch === '.' || ch === '0') continue;
        const v = CHAR_TO_CELL[ch];
        if (v === undefined) throw new Error('bad cell value: ' + ch);
        cells[r * size + c] = v;
      }
    }
    return cells;
  }

  function newGame({ size, board, bank, allowPlant = false } = {}) {
    if (!Number.isInteger(size) || size < 2 || size > 12) throw new Error('Invalid board size');
    if (!Number.isInteger(bank) || bank < 0) throw new Error('Invalid bank');
    const cells = parseBoard(board, size);
    const s = { size, cells, bank, allowPlant, placed: 0, over: false, win: false, last: -1 };
    checkEnd(s);
    return s;
  }

  function clone(s) {
    return {
      size: s.size,
      cells: s.cells.slice(),
      bank: s.bank,
      allowPlant: s.allowPlant,
      placed: s.placed,
      over: s.over,
      win: s.win,
      last: s.last
    };
  }

  function checkEnd(s) {
    if (s.over) return;
    let any = false;
    for (let i = 0; i < s.cells.length; i++) {
      if (s.cells[i] > 0) { any = true; break; }
    }
    if (!any) { s.over = true; s.win = true; return; }
    if (s.bank <= 0) { s.over = true; s.win = false; }
  }

  function canPlay(s, index) {
    if (!Number.isInteger(index) || index < 0 || index >= s.cells.length) {
      return { ok: false, error: 'out-of-range' };
    }
    if (s.over) return { ok: false, error: 'game-over' };
    if (s.bank <= 0) return { ok: false, error: 'no-bank' };
    if (s.cells[index] === 0 && !s.allowPlant) return { ok: false, error: 'empty-no-plant' };
    return { ok: true };
  }

  /* 形状波及范围（不含自身）：返回目标格索引数组。
   * settle 与 solver 的下界/启发共用，保证「规则单一定义源」。 */
  function shapeTargets(size, i, kind) {
    const r = (i / size) | 0;
    const c = i % size;
    const out = [];
    switch (kind) {
      case 1: // 横线：整行
        for (let cc = 0; cc < size; cc++) if (cc !== c) out.push(r * size + cc);
        break;
      case 2: // 竖线：整列
        for (let rr = 0; rr < size; rr++) if (rr !== r) out.push(rr * size + c);
        break;
      case 3: // ▲ 角朝上：整行 + 上半列（T ⊥）
        for (let cc = 0; cc < size; cc++) if (cc !== c) out.push(r * size + cc);
        for (let rr = 0; rr < r; rr++) out.push(rr * size + c);
        break;
      case 4: // ▼ 角朝下：整行 + 下半列（T ⊤）
        for (let cc = 0; cc < size; cc++) if (cc !== c) out.push(r * size + cc);
        for (let rr = r + 1; rr < size; rr++) out.push(rr * size + c);
        break;
      case 5: // ◀ 角朝左：整列 + 左半行
        for (let rr = 0; rr < size; rr++) if (rr !== r) out.push(rr * size + c);
        for (let cc = 0; cc < c; cc++) out.push(r * size + cc);
        break;
      case 6: // ▶ 角朝右：整列 + 右半行
        for (let rr = 0; rr < size; rr++) if (rr !== r) out.push(rr * size + c);
        for (let cc = c + 1; cc < size; cc++) out.push(r * size + cc);
        break;
      case 7: // ■ 方框：周围一圈 8 邻域
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
            out.push(rr * size + cc);
          }
        }
        break;
      default: // 0 十字：整行 + 整列
        for (let cc = 0; cc < size; cc++) if (cc !== c) out.push(r * size + cc);
        for (let rr = 0; rr < size; rr++) if (rr !== r) out.push(rr * size + c);
    }
    return out;
  }

  /* 同步波次结算：先收集全部 ≥4 的棋子，整体移除后再给存活者加一。
   * trace.waves 每波记录 { splits: [{index, from, kind}], boosts: [{from, to, dist, k}] }，
   * dist 为冲击波到目标的切比雪夫格距，k 为波源形状，用于前端延迟演出与着色。 */
  function settle(state, trace) {
    const { size, cells } = state;
    let waves = 0;
    for (;;) {
      const splits = [];
      for (let i = 0; i < cells.length; i++) {
        if (pointsOf(cells[i]) >= 4) splits.push(i);
      }
      if (splits.length === 0) break;
      if (++waves > MAX_WAVES) throw new Error('wave overflow');

      const splitSet = new Set(splits);
      const splitKinds = new Map();
      const wave = { splits: [], boosts: [] };
      for (const i of splits) {
        splitKinds.set(i, kindOf(cells[i]));
        wave.splits.push({ index: i, from: cells[i], kind: splitKinds.get(i) });
        cells[i] = 0; // 棋子消失，点数湮灭
      }
      for (const i of splits) {
        const r = (i / size) | 0;
        const c = i % size;
        const k = splitKinds.get(i);
        for (const j of shapeTargets(size, i, k)) {
          if (splitSet.has(j) || cells[j] === 0) continue;
          cells[j] += 1;
          const rr = (j / size) | 0;
          const cc = j % size;
          const dist = Math.max(Math.abs(rr - r), Math.abs(cc - c));
          wave.boosts.push({ from: i, to: j, dist, k });
        }
      }
      trace.waves.push(wave);
    }
    return waves;
  }

  function applyMove(input, index) {
    const guard = canPlay(input, index);
    if (!guard.ok) return { ok: false, error: guard.error };
    const s = clone(input);
    const trace = {
      place: {
        index,
        planted: s.cells[index] === 0,
        from: s.cells[index],
        to: s.cells[index] + 1,
        kind: s.cells[index] === 0 ? 0 : kindOf(s.cells[index])
      },
      waves: [],
      splits: 0,
      boosts: 0
    };
    s.cells[index] += 1;
    s.placed += 1;
    s.bank -= 1;
    s.last = index;
    settle(s, trace);
    for (const w of trace.waves) {
      trace.splits += w.splits.length;
      trace.boosts += w.boosts.length;
    }
    checkEnd(s);
    trace.over = s.over;
    trace.win = s.win;
    return { ok: true, state: s, trace };
  }

  function validateState(s) {
    if (!s || !Number.isInteger(s.size) || s.size < 2 || s.size > 12) return false;
    if (!Array.isArray(s.cells) || s.cells.length !== s.size * s.size) return false;
    for (const v of s.cells) {
      if (!Number.isInteger(v) || v < 0) return false;
      if (v > 0) {
        const p = pointsOf(v);
        const k = kindOf(v);
        if (p < 1 || p > 3) return false; // 稳定态点数 1~3（≥4 已在结算中分裂）
        if (k < 0 || k > 7) return false;
        if (CELL_TO_CHAR[v] === undefined) return false;
      }
    }
    if (!Number.isInteger(s.bank) || s.bank < 0) return false;
    if (!Number.isInteger(s.placed) || s.placed < 0) return false;
    if (typeof s.over !== 'boolean' || typeof s.win !== 'boolean') return false;
    if (s.win && !s.over) return false;
    if (!Number.isInteger(s.last) || s.last < -1 || s.last >= s.cells.length) return false;
    return true;
  }

  /* 调试 / 测试辅助：把 state.cells 还原为字符串行（含形状字符） */
  function boardToStrings(s) {
    const rows = [];
    for (let r = 0; r < s.size; r++) {
      let row = '';
      for (let c = 0; c < s.size; c++) {
        row += CELL_TO_CHAR[s.cells[r * s.size + c]] || '?';
      }
      rows.push(row);
    }
    return rows;
  }

  return {
    newGame,
    clone,
    applyMove,
    canPlay,
    parseBoard,
    validateState,
    boardToStrings,
    shapeTargets,
    pointsOf,
    kindOf,
    encodeCell,
    KINDS,
    KIND_NAMES,
    CELL_CHARS,
    CHAR_TO_CELL,
    CELL_TO_CHAR,
    MAX_WAVES
  };
});
