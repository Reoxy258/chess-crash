/* 求解器回归：最优深度、回放正确性、播种搜索、超时语义 */
const test = require('node:test');
const assert = require('node:assert');
const engine = require('../engine.js');
const solver = require('../solver.js');

test('已清空局面返回 depth 0', () => {
  const g = engine.newGame({ size: 6, board: ['......', '......', '......', '......', '......', '......'], bank: 0 });
  const res = solver.solve(g);
  assert.deepEqual(res, { moves: [], depth: 0 });
});

test('bank 不足确证无解', () => {
  const g = engine.newGame({ size: 6, board: ['..2...', '......', '......', '......', '......', '......'], bank: 1 });
  // 单颗 2 点棋子需要 2 点才能爆，bank=1 → 无解
  assert.equal(solver.solve(g), null);
});

test('单步解：教程盘 depth 1', () => {
  const g = engine.newGame({ size: 6, board: ['......', '......', '..3.3.', '......', '......', '......'], bank: 1 });
  const res = solver.solve(g);
  assert.equal(res.depth, 1);
  assert.equal(res.moves.length, 1);
});

test('最优性：贪心多步不如直接投 3 点棋子', () => {
  // 一颗 3 点 + 一颗孤立 2 点：最优 = 投3点雷管(1步) + 投2点棋子2次(2步) = 3 步
  // 若贪心先喂 2 点棋子会浪费——solver 应返回 3
  const g = engine.newGame({ size: 6, board: ['3.....', '......', '......', '......', '......', '..2...'], bank: 5 });
  const res = solver.solve(g);
  assert.equal(res.depth, 3);
  const fin = solver.replay(g, res.moves);
  assert.ok(fin.over && fin.win);
});

test('顺序敏感：解序列回放必胜', () => {
  const g = engine.newGame({ size: 6, board: ['...3.1', '.....3', '.2...1', '...223', '...2..', '.....2'], bank: 4 });
  const res = solver.solve(g);
  assert.equal(res.depth, 2);
  const fin = solver.replay(g, res.moves);
  assert.ok(fin.over && fin.win);
});

test('播种搜索：allowPlant 时能找到含空格投点的解', () => {
  const g = engine.newGame({
    size: 7,
    board: ['..3....', '...3...', '...2...', '...2...', '.......', '..1..2.', '...3.3.'],
    bank: 5,
    allowPlant: true
  });
  const res = solver.solve(g);
  assert.ok(res);
  assert.equal(res.depth, 3);
  const flat = g.cells;
  assert.ok(res.moves.some(i => flat[i] === 0), '解中应含播种步');
});

test('超时返回 timeout 而非误判无解', () => {
  const board = [];
  for (let r = 0; r < 9; r++) {
    let row = '';
    for (let c = 0; c < 9; c++) row += (r === c || (r + c) % 4 === 0) ? '2' : '.';
    board.push(row);
  }
  const g = engine.newGame({ size: 9, board, bank: 6, allowPlant: true });
  const res = solver.solve(g, { timeBudget: 1 });
  assert.ok(res && res.timeout === true);
});

test('maxDepth 限制搜索深度', () => {
  const g = engine.newGame({ size: 6, board: ['..2...', '......', '......', '......', '......', '......'], bank: 4 });
  assert.equal(solver.solve(g, { maxDepth: 1 }), null);
  const res = solver.solve(g, { maxDepth: 3 });
  assert.equal(res.depth, 2);
});

test('lowerBound 与 crossCount 单调合理', () => {
  const g = engine.newGame({ size: 6, board: ['..3.3.', '......', '......', '......', '......', '......'], bank: 1 });
  assert.ok(solver.lowerBound(g) >= 1);
  assert.ok(solver.crossCount(g.cells, 6, 14) >= 1);
});

/* 独立穷举参照：不调用 solver 的候选、下界或置换表，以全部合法格 BFS。 */
function exhaustiveDepth(initial, maxDepth = initial.bank) {
  if (initial.win) return 0;
  const queue = [{ state: initial, depth: 0 }];
  const seen = new Set([initial.cells.join(',')]);
  for (let head = 0; head < queue.length; head++) {
    const { state, depth } = queue[head];
    if (depth >= maxDepth || state.over) continue;
    for (let index = 0; index < state.cells.length; index++) {
      const move = engine.applyMove(state, index);
      if (!move.ok) continue;
      if (move.state.win) return depth + 1;
      const key = move.state.cells.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ state: move.state, depth: depth + 1 });
    }
  }
  return null;
}

function assertMatchesExhaustive(game, maxDepth = game.bank) {
  const expected = exhaustiveDepth(game, maxDepth);
  const result = solver.solve(game, { maxDepth });
  assert.equal(result ? result.depth : null, expected,
    JSON.stringify({ board: engine.boardToStrings(game), bank: game.bank, maxDepth }));
  if (result) {
    assert.ok(solver.replay(game, result.moves).win);
    assert.ok(solver.lowerBound(game) <= result.depth, '下界不能高估实际最优解');
  }
}

test('播种候选包含非接波空格，主动引爆四步解不能被误剪', () => {
  const game = engine.newGame({
    size: 4, board: ['.FFF', 'C...', 'C...', 'C...'], bank: 4, allowPlant: true
  });
  assert.ok(solver.candidates(game).includes(0), '非接波位也必须保留');
  assert.ok(solver.lowerBound(game) <= 4);
  assert.ok(solver.replay(game, [0, 0, 0, 0]).win);
  const result = solver.solve(game);
  assert.ok(result && !result.timeout);
  assert.equal(result.depth, 4);
  assert.ok(solver.replay(game, result.moves).win);
});

test('全部 2401 个混形 2×2 棋盘与独立三步 BFS 一致', () => {
  const alphabet = ['.', '1', '2', '3', 'C', 'F', 'U'];
  for (let code = 0; code < alphabet.length ** 4; code++) {
    let n = code;
    const cells = [];
    for (let i = 0; i < 4; i++) {
      cells.push(alphabet[n % alphabet.length]);
      n = Math.floor(n / alphabet.length);
    }
    const game = engine.newGame({
      size: 2, board: [cells.slice(0, 2).join(''), cells.slice(2).join('')],
      bank: 3, allowPlant: true
    });
    assertMatchesExhaustive(game);
  }
});

test('含所有朝向的 3×3 播种棋盘与独立四步 BFS 一致', () => {
  let seed = 20261026;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const chars = engine.CELL_CHARS.join('');
  for (let sample = 0; sample < 96; sample++) {
    const rows = [];
    for (let r = 0; r < 3; r++) {
      let row = '';
      for (let c = 0; c < 3; c++) {
        row += random() < 0.55 ? '.' : chars[Math.floor(random() * chars.length)];
      }
      rows.push(row);
    }
    assertMatchesExhaustive(engine.newGame({ size: 3, board: rows, bank: 4, allowPlant: true }));
  }
});

test('同格清空后重复播种的中局仍与独立 BFS 一致', () => {
  let game = engine.newGame({
    size: 3, board: ['3..', '...', '1..'], bank: 10, allowPlant: true
  });
  let planted = 0;
  // 首次引爆原棋子；播种并再次引爆；第三次在同一格开始新的种子。
  for (const index of [0, 0, 0, 0, 0, 0]) {
    const result = engine.applyMove(game, index);
    assert.ok(result.ok && !result.state.over);
    if (result.trace.place.planted) planted++;
    game = result.state;
    assertMatchesExhaustive(game, 3);
  }
  assert.equal(planted, 2);
});
