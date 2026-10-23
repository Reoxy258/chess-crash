/* 十字连爆 · chess-crash — 确定性规则引擎（浏览器 / 生成工具 / 测试共用）
 *
 * 规则核心：
 * - 棋盘上预填 1~3 点的棋子；玩家每回合消耗 1 点手牌，给一颗棋子 +1
 *   （第 5 章起允许把点数“播种”到空格，长出一颗 1 点新棋子）。
 * - 棋子达到 4 点即分裂：该棋子消失（全部点数湮灭），
 *   同一横行与纵列上的所有存活棋子各 +1。
 * - 同一波次内达到 4 的棋子同时分裂：分裂者先行移除、互不加成；
 *   存活者若同时被多道冲击波扫中则累加；达到 4（及以上）进入下一波。
 * - 棋子数单调递减、空格不自动生棋，连锁必然终止（MAX_WAVES 仅为保险丝）。
 * - 目标：清空棋盘所有棋子。手牌耗尽仍未清空即失败。
 *
 * 状态不可变：applyMove 返回全新 state 与逐波 trace（含冲击波距离，
 * 供前端按距离延迟播放“十字冲击”演出）。
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CC_ENGINE = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const MAX_WAVES = 4096; // 理论上不可达，防御性保险丝

  function parseBoard(board, size) {
    if (!Array.isArray(board) || board.length !== size) throw new Error('board rows mismatch');
    const cells = new Array(size * size).fill(0);
    for (let r = 0; r < size; r++) {
      const row = board[r];
      if (typeof row !== 'string' || row.length !== size) throw new Error('board row width mismatch');
      for (let c = 0; c < size; c++) {
        const ch = row[c];
        if (ch === '.' || ch === '0') continue;
        const n = ch.charCodeAt(0) - 48;
        if (n < 1 || n > 3) throw new Error('bad cell value: ' + ch);
        cells[r * size + c] = n;
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

  /* 同步波次结算：先收集全部 ≥4 的棋子，整体移除后再给存活者加一。
   * trace.waves 每波记录 { splits: [{index, from}], boosts: [{from, to, dist}] }，
   * dist 为冲击波沿行/列的格距，用于前端延迟演出。 */
  function settle(state, trace) {
    const { size, cells } = state;
    let waves = 0;
    for (;;) {
      const splits = [];
      for (let i = 0; i < cells.length; i++) {
        if (cells[i] >= 4) splits.push(i);
      }
      if (splits.length === 0) break;
      if (++waves > MAX_WAVES) throw new Error('wave overflow');

      const splitSet = new Set(splits);
      const wave = { splits: [], boosts: [] };
      for (const i of splits) {
        wave.splits.push({ index: i, from: cells[i] });
        cells[i] = 0; // 棋子消失，点数湮灭
      }
      for (const i of splits) {
        const r = (i / size) | 0;
        const c = i % size;
        for (let cc = 0; cc < size; cc++) {
          const j = r * size + cc;
          if (j === i || splitSet.has(j) || cells[j] === 0) continue;
          cells[j] += 1;
          wave.boosts.push({ from: i, to: j, dist: Math.abs(cc - c) });
        }
        for (let rr = 0; rr < size; rr++) {
          const j = rr * size + c;
          if (j === i || splitSet.has(j) || cells[j] === 0) continue;
          cells[j] += 1;
          wave.boosts.push({ from: i, to: j, dist: Math.abs(rr - r) });
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
        to: s.cells[index] + 1
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
      if (!Number.isInteger(v) || v < 0 || v > 3) return false;
    }
    if (!Number.isInteger(s.bank) || s.bank < 0) return false;
    if (!Number.isInteger(s.placed) || s.placed < 0) return false;
    if (typeof s.over !== 'boolean' || typeof s.win !== 'boolean') return false;
    if (s.win && !s.over) return false;
    if (!Number.isInteger(s.last) || s.last < -1 || s.last >= s.cells.length) return false;
    return true;
  }

  /* 调试 / 测试辅助：把 state.cells 还原为字符串行 */
  function boardToStrings(s) {
    const rows = [];
    for (let r = 0; r < s.size; r++) {
      let row = '';
      for (let c = 0; c < s.size; c++) {
        const v = s.cells[r * s.size + c];
        row += v === 0 ? '.' : String(v);
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
    MAX_WAVES
  };
});
