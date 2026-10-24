/* 挑战生成回归：难度曲线、确定性、可解性、每日同款 */
const test = require('node:test');
const assert = require('node:assert');
const engine = require('../engine.js');
const solver = require('../solver.js');
const CH = require('../challenge.js');

test('stageSpec 难度曲线单调合理', () => {
  let lastSize = 0;
  let lastTight = 99;
  for (let s = 0; s <= 25; s++) {
    const spec = CH.stageSpec(s);
    assert.ok(spec.size >= lastSize, '棋盘不缩小 stage=' + s);
    assert.ok(spec.par >= 1 && spec.par <= 6, 'par 在 1..6 stage=' + s);
    assert.ok(spec.targetB >= 4, '棋子数下限 stage=' + s);
    assert.ok(spec.bankPad <= lastTight, '手牌只收紧不放宽 stage=' + s);
    assert.equal(spec.bankPad >= 0 ? spec.par + spec.bankPad : NaN, spec.par + spec.bankPad);
    lastSize = spec.size;
    lastTight = Math.min(lastTight, spec.bankPad);
  }
  const early = CH.stageSpec(1);
  const late = CH.stageSpec(20);
  assert.ok(early.size < late.size && early.par < late.par, '前后难度拉开');
});

test('makeChallenge 生成的关卡与 solver 复算一致且可解', () => {
  for (const stage of [0, 3, 8, 15]) {
    const lv = CH.makeChallenge(stage, 424242);
    assert.ok(lv, 'stage ' + stage + ' 应能生成');
    assert.equal(lv.par, CH.stageSpec(stage).par, 'par 匹配配方');
    assert.equal(lv.board.length, lv.size);
    for (const row of lv.board) {
      assert.equal(row.length, lv.size);
      assert.ok(/^[.123A-U]+$/.test(row), '字符集（数字 + 形状字母）');
    }
    const g = engine.newGame({ size: lv.size, board: lv.board, bank: lv.bank, allowPlant: false });
    const res = solver.solve(g, { timeBudget: 8000 });
    assert.ok(res && !res.timeout, 'stage ' + stage + ' 可解');
    assert.equal(res.depth, lv.par, 'stage ' + stage + ' par 复算一致');
    const fin = solver.replay(g, res.moves);
    assert.ok(fin.over && fin.win, 'stage ' + stage + ' 解回放必胜');
  }
});

test('形状随 stage 递进混入：早期纯普通，8 起直线，15 起全开', () => {
  for (const stage of [0, 3]) {
    const lv = CH.makeChallenge(stage, 77);
    assert.ok(lv, 'stage ' + stage + ' 应能生成');
    assert.ok(lv.board.every(r => /^[.123]+$/.test(r)), 'stage ' + stage + ' 纯普通棋');
  }
  const lv8 = CH.makeChallenge(8, 77);
  assert.ok(lv8, 'stage 8 应能生成');
  const flat8 = lv8.board.join('');
  assert.ok(/[A-F]/.test(flat8), 'stage 8 含直线棋');
  assert.ok(!/[G-U]/.test(flat8), 'stage 8 无三角/方框');
  const lv15 = CH.makeChallenge(15, 77);
  assert.ok(lv15, 'stage 15 应能生成');
  const flat15 = lv15.board.join('');
  assert.ok(/[A-F]/.test(flat15) && /[G-R]/.test(flat15) && /[S-U]/.test(flat15), 'stage 15 四类形状齐全（家族钉子）');
});

test('makeChallenge 确定性：同种子同关卡', () => {
  const a = CH.makeChallenge(6, 999);
  const b = CH.makeChallenge(6, 999);
  assert.ok(a && b);
  assert.deepEqual(a.board, b.board);
  const c = CH.makeChallenge(6, 1000);
  assert.ok(c);
  assert.notDeepEqual(a.board, c.board);
});

test('makeDaily 同一天全站同款，不同日不同款', () => {
  const d1 = new Date(2026, 9, 23);
  const a = CH.makeDaily(d1);
  const b = CH.makeDaily(d1);
  assert.ok(a && b, '当日应能生成');
  assert.deepEqual(a.board, b.board);
  assert.equal(a.mode, 'daily');
  const c = CH.makeDaily(new Date(2026, 9, 24));
  assert.ok(c);
  assert.notDeepEqual(a.board, c.board);
  // makeDaily 可解性验证
  const g = engine.newGame({ size: a.size, board: a.board, bank: a.bank, allowPlant: false });
  const res = solver.solve(g, { timeBudget: 8000 });
  assert.ok(res && !res.timeout && res.depth === a.par);
});

test('dateKey 输出补零格式', () => {
  assert.equal(CH.dateKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(CH.dateKey(new Date(2026, 10, 23)), '2026-11-23');
});

test('mulberry32 与 randomBoard 确定性', () => {
  const r1 = CH.mulberry32(7);
  const r2 = CH.mulberry32(7);
  const seq1 = [r1(), r1(), r1()];
  const seq2 = [r2(), r2(), r2()];
  assert.deepEqual(seq1, seq2);
  const b1 = CH.randomBoard(6, 8, [1, 2, 2], 0.4, CH.mulberry32(7));
  const b2 = CH.randomBoard(6, 8, [1, 2, 2], 0.4, CH.mulberry32(7));
  assert.deepEqual(b1, b2);
});
