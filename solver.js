/* 十字连爆 · chess-crash — 最小投点数求解器
 *
 * 关卡生成验证与运行时提示共用：
 * - IDDFS（迭代加深）天然给出“最优投点数”（par）；
 * - 置换表（cells+bank 序列化键）剪掉殊途同归的重复局面；
 * - 乐观下界剪枝：清盘要求每颗棋子爆一次（至少 -4），
 *   冲击波传输量至多抵消十字邻居数，推出剩余手牌的最低需求；
 * - 候选启发排序：离爆更近的棋子、十字伙伴更多的棋子优先；
 *   播种候选仅考虑与存活棋子同行/同列的空格（接波位）；
 * - timeBudget 超时以异常中断，solve 返回 { timeout: true }，
 *   调用方据此降级（提示）或丢弃关卡（生成器）。
 */
(function (root, factory) {
  'use strict';
  const engineRef = (typeof module !== 'undefined' && module.exports)
    ? require('./engine.js')
    : root.CC_ENGINE;
  const api = factory(engineRef);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CC_SOLVER = api;
})(typeof self !== 'undefined' ? self : globalThis, function (engine) {
  'use strict';

  function solved(s) {
    for (let i = 0; i < s.cells.length; i++) {
      if (s.cells[i] > 0) return false;
    }
    return true;
  }

  function crossCount(cells, size, i) {
    const r = (i / size) | 0;
    const c = i % size;
    let n = 0;
    for (let cc = 0; cc < size; cc++) {
      if (cc !== c && cells[r * size + cc] > 0) n++;
    }
    for (let rr = 0; rr < size; rr++) {
      if (rr !== r && cells[rr * size + c] > 0) n++;
    }
    return n;
  }

  function candidates(s) {
    const { size, cells } = s;
    const list = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === 0) continue;
      list.push({ index: i, need: 4 - cells[i], cross: crossCount(cells, size, i) });
    }
    list.sort((a, b) => (a.need - b.need) || (b.cross - a.cross));
    const order = list.map(x => x.index);
    if (s.allowPlant) {
      const rows = new Array(size).fill(false);
      const cols = new Array(size).fill(false);
      for (let i = 0; i < cells.length; i++) {
        if (cells[i] > 0) { rows[(i / size) | 0] = true; cols[i % size] = true; }
      }
      for (let i = 0; i < cells.length; i++) {
        if (cells[i] !== 0) continue;
        if (rows[(i / size) | 0] || cols[i % size]) order.push(i);
      }
    }
    return order;
  }

  function lowerBound(s) {
    const { cells, size } = s;
    let B = 0;
    let S = 0;
    let X = 0;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === 0) continue;
      B++;
      S += cells[i];
      X += crossCount(cells, size, i);
    }
    if (B === 0) return 0;
    return Math.max(1, 4 * B - S - X);
  }

  let deadline = 0;

  function dfs(s, depth, failed) {
    if (solved(s)) return [];
    if (depth <= 0) return null;
    const lb = lowerBound(s);
    if (lb > depth) return null;
    const key = s.cells.join('') + '|' + s.bank;
    const prior = failed.get(key);
    if (prior !== undefined && prior >= depth) return null;
    for (const idx of candidates(s)) {
      if (deadline && Date.now() > deadline) throw new Error('solver timeout');
      const r = engine.applyMove(s, idx);
      if (!r.ok) continue;
      const sub = dfs(r.state, depth - 1, failed);
      if (sub) return [idx, ...sub];
    }
    failed.set(key, depth);
    return null;
  }

  /* solve(state, { maxDepth, timeBudget })
   * → { moves: [index...], depth } 最浅解
   *   | null（预算深度内确证无解）
   *   | { timeout: true }（时间耗尽，结论不可信） */
  function solve(state, opts = {}) {
    deadline = opts.timeBudget ? Date.now() + opts.timeBudget : 0;
    if (solved(state)) return { moves: [], depth: 0 };
    if (state.over && !state.win) return null;
    const maxDepth = Math.min(opts.maxDepth ?? state.bank, state.bank);
    if (maxDepth <= 0) return null;
    for (let d = 1; d <= maxDepth; d++) {
      const failed = new Map();
      try {
        const res = dfs(state, d, failed);
        if (res) return { moves: res, depth: d };
      } catch (err) {
        if (err && err.message === 'solver timeout') return { timeout: true };
        throw err;
      }
    }
    return null;
  }

  /* 求解结果回放校验（生成器与测试共用） */
  function replay(state, moves) {
    let cur = state;
    for (const idx of moves) {
      const r = engine.applyMove(cur, idx);
      if (!r.ok) return null;
      cur = r.state;
    }
    return cur;
  }

  return { solve, replay, solved, candidates, lowerBound, crossCount };
});
