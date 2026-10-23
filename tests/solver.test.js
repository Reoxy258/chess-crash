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
