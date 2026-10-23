/* 快速冒烟：核心规则 + 求解器手工用例（正式回归见 tests/） */
const engine = require('../engine.js');
const solver = require('../solver.js');

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; console.log('  FAIL - ' + name); }
}

// 1. 教程盘：两颗同行 3 点棋子，投 1 点 → 双波连锁全清
{
  const g = engine.newGame({ size: 6, board: ['......', '......', '..3.3.', '......', '......', '......'], bank: 1 });
  const r = engine.applyMove(g, 14); // (2,2)
  check('教程盘：投点成功', r.ok);
  check('教程盘：两波连锁', r.trace.waves.length === 2);
  check('教程盘：两颗全消失', r.trace.splits === 2);
  check('教程盘：冲击波 1 道（dist=2）', r.trace.waves[0].boosts.length === 1 && r.trace.waves[0].boosts[0].dist === 2);
  check('教程盘：胜利', r.state.over && r.state.win);
}

// 2. 十字传播：中心爆，同行同列 +1，斜角不动，空格不生棋
//    十字臂全放 3 点棋：波1 中心爆 → 四臂 +1 到 4；波2 四颗同波齐爆（互不加成）
{
  const board = [
    '......',
    '...3..',
    '..333.',
    '...3..',
    '......',
    '......'
  ];
  const g = engine.newGame({ size: 6, board, bank: 1 });
  const r = engine.applyMove(g, 15); // (2,3) → 4
  const s = r.state;
  check('十字：中心消失', s.cells[15] === 0);
  check('十字：波 1 四道冲击波', r.trace.waves[0].boosts.length === 4);
  check('十字：波 2 四颗同波齐爆', r.trace.waves[1].splits.length === 4);
  check('十字：同波分裂互不加成（无多余波）', r.trace.waves.length === 2);
  check('十字：全清获胜', s.over && s.win && r.trace.splits === 5);
  const res = solver.solve(g);
  check('solver：十字盘 par=1', res && res.depth === 1);
}

// 3. 播种与错误码
{
  const g = engine.newGame({ size: 5, board: ['.....', '.....', '..2..', '.....', '.....'], bank: 3 });
  check('空格禁止播种', engine.applyMove(g, 0).error === 'empty-no-plant');
  const g2 = engine.newGame({ size: 5, board: ['.....', '.....', '..2..', '.....', '.....'], bank: 3, allowPlant: true });
  const r = engine.applyMove(g2, 0);
  check('播种出 1 点棋子', r.ok && r.state.cells[0] === 1);
  const over = engine.newGame({ size: 4, board: ['.2..', '....', '..3.', '....'], bank: 0 });
  check('bank 尽非空判负', over.over && !over.win);
}

// 4. solver 求解教程盘
{
  const g = engine.newGame({ size: 6, board: ['......', '......', '..3.3.', '......', '......', '......'], bank: 1 });
  const res = solver.solve(g);
  check('solver：教程盘 depth=1', res && res.depth === 1 && res.moves.length === 1);
  const fin = solver.replay(g, res.moves);
  check('solver：回放全清', fin && fin.over && fin.win);
}

// 5. 超时标记
{
  const big = [];
  for (let r = 0; r < 9; r++) {
    let row = '';
    for (let c = 0; c < 9; c++) row += ((r * 9 + c) % 3 === 0 && Math.random() < 0.5) ? '2' : '.';
    big.push(row);
  }
  const g = engine.newGame({ size: 9, board: big, bank: 6, allowPlant: true });
  const res = solver.solve(g, { timeBudget: 1 });
  check('solver：超时返回 timeout', res && res.timeout === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
