/* 十字连爆 · chess-crash — 最小投点数求解器
 *
 * 关卡生成验证与运行时提示共用：
 * - IDDFS（迭代加深）天然给出“最优投点数”（par）；
 * - 置换表（cells+bank 序列化键）剪掉殊途同归的重复局面；
 * - 乐观下界剪枝：清盘要求每颗棋子爆一次（至少 -4），
 *   冲击波传输量至多抵消其形状可波及的存活伙伴数，推出剩余手牌的最低需求；
 * - 候选启发排序：离爆更近的棋子、波及伙伴更多的棋子优先；
 *   播种搜索保留全部空格，接波位只影响优先顺序；
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

  /* 几何范围只取决于棋盘尺寸、格号和形状，可跨搜索节点复用。 */
  const targetCache = new Map();
  function targets(size, index, kind) {
    const key = size + ':' + kind + ':' + index;
    if (!targetCache.has(key)) targetCache.set(key, engine.shapeTargets(size, index, kind));
    return targetCache.get(key);
  }

  function blastCount(cells, size, i) {
    let n = 0;
    for (const j of targets(size, i, engine.kindOf(cells[i]))) {
      if (cells[j] > 0) n++;
    }
    return n;
  }

  const crossCount = blastCount;

  /* 当前棋子的入波上界：每颗现有棋子最多爆一次，忽略先后次序与同波互斥，
   * 因而只会高估可能得到的冲击波，适合用来推导乐观下界。 */
  function analyze(s) {
    const { size, cells } = s;
    const incoming = new Array(cells.length).fill(0);
    const pieces = [];
    let points = 0, transfers = 0, first = 4;
    for (let i = 0; i < cells.length; i++) {
      if (!cells[i]) continue;
      const need = 4 - engine.pointsOf(cells[i]);
      let cross = 0;
      for (const j of targets(size, i, engine.kindOf(cells[i]))) {
        incoming[j]++;
        if (cells[j]) cross++;
      }
      pieces.push({ index: i, need, cross });
      points += engine.pointsOf(cells[i]);
      transfers += cross;
      first = Math.min(first, need);
    }
    return { incoming, pieces, points, transfers, first };
  }

  function candidates(s, info = analyze(s)) {
    const list = info.pieces.slice();
    list.sort((a, b) => (a.need - b.need) || (b.cross - a.cross));
    const order = list.map(x => x.index);
    if (s.allowPlant) {
      const seeds = [];
      for (let i = 0; i < s.cells.length; i++) {
        if (s.cells[i]) continue;
        let cross = 0;
        for (const j of targets(s.size, i, 0)) if (s.cells[j]) cross++;
        seeds.push({ index: i, incoming: info.incoming[i], cross });
      }
      // 接波位仅用于排序。非接波位也可能靠主动投点引爆，不能排除。
      seeds.sort((a, b) => (b.incoming - a.incoming) || (b.cross - a.cross) || (a.index - b.index));
      for (const seed of seeds) order.push(seed.index);
    }
    return order;
  }

  function lowerBound(s, info = analyze(s), maxSeeds = s.bank) {
    const { pieces, incoming, points, transfers, first } = info;
    if (pieces.length === 0) return 0;
    const deficit = 4 * pieces.length - points - transfers;
    const direct = pieces.reduce((n, p) => n + Math.max(0, p.need - incoming[p.index]), 0);
    let best = Math.max(first, deficit, direct);
    if (!s.allowPlant || maxSeeds === 0) return best;

    let maxIncoming = 0, maxOutgoing = 0;
    // 可在被清空的原棋子位置播种，所以这里包括所有格，不限当前空格。
    for (let i = 0; i < s.cells.length; i++) {
      maxIncoming = Math.max(maxIncoming, incoming[i]);
      let outgoing = 0;
      for (const j of targets(s.size, i, 0)) if (s.cells[j]) outgoing++;
      maxOutgoing = Math.max(maxOutgoing, outgoing);
    }
    /* 假设未来种 n 颗新棋子（含同格重复播种）：
     * - 每颗现有棋子至多再收到 n 次来自种子的波；
     * - 每颗种子至多接收 maxIncoming + n - 1 次波，且至少花 1 点播种；
     * - 总传波至多新增 n*(maxIncoming+maxOutgoing)+n*(n-1)。
     * 三个约束都故意高估传波，只会低估所需投点。枚举 n 取最小，
     * 才能覆盖播种后的新连接；旧的纯现存棋子下界在播种时不成立。 */
    for (let n = 1; n <= maxSeeds && n < best; n++) {
      let originalClicks = 0;
      for (const piece of pieces) {
        originalClicks += Math.max(0, piece.need - incoming[piece.index] - n);
      }
      const seedClicks = n * Math.max(1, 4 - maxIncoming - (n - 1));
      const mass = deficit + 4 * n - n * (maxIncoming + maxOutgoing) - n * (n - 1);
      best = Math.min(best, Math.max(first, originalClicks + seedClicks, mass));
    }
    return best;
  }

  function dfs(s, depth, failed, deadline, minPrepare = 0) {
    if (solved(s)) return [];
    if (depth <= 0) return null;
    if (deadline && Date.now() > deadline) throw new Error('solver timeout');
    const key = s.cells.join(',') + '|' + s.bank + '|' + minPrepare;
    const prior = failed.get(key);
    if (prior !== undefined && prior >= depth) return null;
    const info = analyze(s);
    if (lowerBound(s, info, depth === 1 ? 0 : depth) > depth) return null;
    const order = depth === 1
      ? info.pieces.filter(p => p.need === 1).map(p => p.index)
      : candidates(s, info);
    for (const idx of order) {
      if (deadline && Date.now() > deadline) throw new Error('solver timeout');
      const detonates = engine.pointsOf(s.cells[idx]) === 3;
      // 连续不爆的投点彼此可交换；只搜索格号非递减的准备步骤。
      // 真正引爆的一步不受格号限制，爆后重新开始，保留所有解。
      if (!detonates && idx < minPrepare) continue;
      const r = engine.applyMove(s, idx);
      if (!r.ok) continue;
      const sub = dfs(r.state, depth - 1, failed, deadline, detonates ? 0 : idx);
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
    const deadline = opts.timeBudget ? Date.now() + opts.timeBudget : 0;
    if (solved(state)) return { moves: [], depth: 0 };
    if (state.over && !state.win) return null;
    const maxDepth = Math.min(opts.maxDepth ?? state.bank, state.bank);
    if (maxDepth <= 0) return null;
    for (let d = 1; d <= maxDepth; d++) {
      const failed = new Map();
      try {
        const res = dfs(state, d, failed, deadline);
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

  return { solve, replay, solved, candidates, lowerBound, crossCount, blastCount };
});
