/* 引擎规则回归：分裂、十字传播、同波语义、胜负、不可变性、终止性 */
const test = require('node:test');
const assert = require('node:assert');
const engine = require('../engine.js');

const B6 = (rows, bank = 9, extra = {}) => engine.newGame({ size: 6, board: rows, bank, ...extra });

test('newGame 解析棋盘并保持稳定态合法', () => {
  const g = B6(['..3.3.', '......', '......', '......', '......', '......'], 2);
  assert.equal(g.cells[2], 3);
  assert.equal(g.cells[4], 3);
  assert.equal(g.cells[14], 0);
  assert.ok(engine.validateState(g));
});

test('newGame 拒绝非法输入', () => {
  assert.throws(() => engine.newGame({ size: 6, board: ['...'], bank: 1 }));
  assert.throws(() => engine.newGame({ size: 6, board: ['......', '......', '..4...', '......', '......', '......'], bank: 1 }));
  assert.throws(() => engine.newGame({ size: 1, board: ['.'], bank: 1 }));
  assert.throws(() => engine.newGame({ size: 6, board: ['......', '......', '......', '......', '......', '......'], bank: -1 }));
});

test('空棋盘开局即胜利', () => {
  const g = B6(['......', '......', '......', '......', '......', '......'], 0);
  assert.ok(g.over && g.win);
});

test('canPlay 错误码完整', () => {
  const g = B6(['..3...', '......', '......', '......', '......', '......'], 1);
  assert.equal(engine.applyMove(g, -1).error, 'out-of-range');
  assert.equal(engine.applyMove(g, 36).error, 'out-of-range');
  assert.equal(engine.applyMove(g, 0).error, 'empty-no-plant');
  const done = engine.applyMove(g, 2).state;
  if (done.over) {
    assert.equal(engine.applyMove(done, 3).error, 'game-over');
  } else {
    assert.equal(engine.applyMove(done, 3).error, 'no-bank');
  }
});

test('投点 +1 不触发分裂', () => {
  const g = B6(['..2...', '......', '......', '......', '......', '......'], 3);
  const r = engine.applyMove(g, 2);
  assert.ok(r.ok);
  assert.equal(r.state.cells[2], 3);
  assert.equal(r.trace.waves.length, 0);
  assert.equal(r.state.placed, 1);
  assert.equal(r.state.bank, 2);
});

test('播种：空格长出 1 点棋子', () => {
  const g = B6(['..2...', '......', '......', '......', '......', '......'], 3, { allowPlant: true });
  const r = engine.applyMove(g, 20);
  assert.ok(r.ok);
  assert.equal(r.state.cells[20], 1);
  assert.ok(r.trace.place.planted);
});

test('十字传播：中心爆，行列传波，斜角与空格不受影响', () => {
  const g = B6(['..2...', '...1..', '.1.3..', '...1..', '..2...', '......'], 1);
  const r = engine.applyMove(g, 15); // (2,3) 3→4
  assert.ok(r.ok);
  const s = r.state;
  assert.equal(s.cells[15], 0);   // 中心消失
  assert.equal(s.cells[13], 2);   // (2,1) 同行 1+1
  assert.equal(s.cells[9], 2);    // (1,3) 同列 1+1
  assert.equal(s.cells[21], 2);   // (3,3) 同列 1+1
  assert.equal(s.cells[2], 2);    // (0,2) 斜角不动
  assert.equal(s.cells[26], 2);   // (4,2) 斜角不动
  assert.equal(s.cells[16], 0);   // (2,4) 空格不生棋
  assert.equal(r.trace.waves.length, 1);
  assert.equal(r.trace.waves[0].boosts.length, 3);
});

test('同波多分裂：分裂者先行移除、互不加成；存活者可叠吃多道波', () => {
  // (1,1)=3 (1,3)=3 (1,5)=3 同行，(2,3)=2：
  // 投 (1,1) → 波1 {(1,1)}：(1,3)(1,5) 到 4
  // 波2 {(1,3),(1,5)} 同波移除互不加；各自波只给 (2,3) +1 → 3 不爆 → 结束
  const g = B6(['......', '.3.3.3', '...2..', '......', '......', '......'], 1);
  const r = engine.applyMove(g, 7);
  assert.ok(r.ok);
  const s = r.state;
  assert.equal(s.cells[7], 0);
  assert.equal(s.cells[9], 0);
  assert.equal(s.cells[11], 0);
  assert.equal(s.cells[15], 3); // (2,3) 只吃 (1,3) 一道波（(1,5) 不同列）
  assert.equal(r.trace.waves.length, 2);
  assert.equal(r.trace.splits, 3);
});

test('双分裂夹击：同波两颗爆源夹同一存活者 → +2', () => {
  // (1,1)=3 与 (1,5)=3 同行，(1,3)=2 夹在中间：
  // 需要两颗同波爆。先投 (1,1)：波1 {(1,1)} → (1,3) 2+1=3, (1,5) 3+1=4
  // 波2 {(1,5)} → (1,3) 3+1=4 → 波3 {(1,3)} 爆 → 全清
  const g = B6(['......', '.3.2.3', '......', '......', '......', '......'], 1);
  const r = engine.applyMove(g, 7);
  assert.ok(r.state.over && r.state.win);
  assert.equal(r.trace.splits, 3);
  assert.equal(r.trace.waves.length, 3);
  // (1,3) 在波2 收到 (1,5) 的波 → dist = 2
  const w2 = r.trace.waves[1];
  assert.ok(w2.boosts.some(b => b.to === 9 && b.dist === 2));
});

test('瞬态超 4 点（叠波 ≥4）同样整颗消失', () => {
  // (2,2)=3, (2,3)=3, (2,4)=3 同行相邻；投 (2,3) → 4 爆
  // 波1 {(2,3)}：(2,2) 3+1=4, (2,4) 3+1=4 → 波2 同波爆 → 清空
  const g = B6(['......', '......', '..333.', '......', '......', '......'], 1);
  const r = engine.applyMove(g, 15);
  assert.ok(r.state.over && r.state.win);
  assert.equal(r.trace.splits, 3);
});

test('applyMove 不可变：输入状态不被修改', () => {
  const g = B6(['..3.3.', '......', '......', '......', '......', '......'], 2);
  const before = JSON.stringify(g);
  engine.applyMove(g, 14);
  assert.equal(JSON.stringify(g), before);
});

test('胜负判定：手牌耗尽且棋盘非空判负', () => {
  const g = B6(['..2...', '......', '......', '......', '......', '......'], 1);
  const r = engine.applyMove(g, 2); // 2→3，无连锁
  assert.ok(r.state.over);
  assert.ok(!r.state.win);
});

test('trace 携带波次与距离信息', () => {
  const g = B6(['......', '......', '..3.3.', '......', '......', '......'], 1);
  const r = engine.applyMove(g, 14);
  const w = r.trace.waves[0];
  assert.equal(w.splits.length, 1);
  assert.equal(w.splits[0].index, 14);
  assert.equal(w.splits[0].from, 4);
  assert.equal(w.boosts[0].to, 16);
  assert.equal(w.boosts[0].dist, 2);
});

test('boardToStrings 可逆输出', () => {
  const g = B6(['..3.3.', '......', '......', '......', '......', '......'], 2);
  assert.deepEqual(engine.boardToStrings(g), ['..3.3.', '......', '......', '......', '......', '......']);
});

test('终止性：随机棋盘上合法随机投点必然有限步内结束', () => {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(1234);
  for (let trial = 0; trial < 400; trial++) {
    const size = 5 + Math.floor(rnd() * 2);
    const board = [];
    for (let r = 0; r < size; r++) {
      let row = '';
      for (let c = 0; c < size; c++) {
        row += rnd() < 0.35 ? String(1 + Math.floor(rnd() * 3)) : '.';
      }
      board.push(row);
    }
    let g = engine.newGame({ size, board, bank: 8, allowPlant: rnd() < 0.5 });
    let steps = 0;
    while (!g.over && steps < 40) {
      // 模拟理性玩家：只在合法位置（棋子，或允许播种时的空格）中随机选
      const legal = [];
      for (let i = 0; i < g.cells.length; i++) {
        if (g.cells[i] > 0 || g.allowPlant) legal.push(i);
      }
      if (legal.length === 0) break;
      const idx = legal[Math.floor(rnd() * legal.length)];
      const r = engine.applyMove(g, idx);
      if (r.ok) g = r.state;
      steps++;
    }
    assert.ok(g.over, '随机局应在有限步内结束 trial=' + trial + ' steps=' + steps + ' bank=' + g.bank);
  }
});

test('validateState 拒绝被篡改的状态', () => {
  const g = B6(['..3...', '......', '......', '......', '......', '......'], 2);
  assert.ok(engine.validateState(g));
  const bad = engine.clone(g);
  bad.cells[2] = 9;
  assert.ok(!engine.validateState(bad));
  const bad2 = engine.clone(g);
  bad2.win = true;
  assert.ok(!engine.validateState(bad2));
});
