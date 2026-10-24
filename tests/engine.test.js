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

/* ================= 特殊形状（v1.2.0） ================= */

test('棋盘字符编码：字母形状棋解析与 boardToStrings 可逆', () => {
  const g = B6(['A..G.K', '.B.S..', '......', '......', '......', '...U..'], 9);
  assert.equal(engine.kindOf(g.cells[0]), 1);   // A = 横线 1 点
  assert.equal(engine.pointsOf(g.cells[0]), 1);
  assert.equal(engine.kindOf(g.cells[3]), 3);   // G = ▲ 1 点
  assert.equal(engine.kindOf(g.cells[5]), 4);   // K = ▼ 2 点
  assert.equal(engine.pointsOf(g.cells[5]), 2);
  assert.equal(engine.kindOf(g.cells[9]), 7);   // S = ■ 1 点（(1,3)）
  assert.equal(engine.pointsOf(g.cells[9]), 1);
  assert.equal(engine.kindOf(g.cells[33]), 7);  // U = ■ 3 点（(5,3)）
  assert.equal(engine.pointsOf(g.cells[33]), 3);
  assert.deepEqual(engine.boardToStrings(g), ['A..G.K', '.B.S..', '......', '......', '......', '...U..']);
  assert.ok(engine.validateState(g));
});

test('newGame 拒绝未知字符', () => {
  assert.throws(() => engine.newGame({ size: 6, board: ['..V...', '......', '......', '......', '......', '......'], bank: 1 }));
  assert.throws(() => engine.newGame({ size: 6, board: ['..4...', '......', '......', '......', '......', '......'], bank: 1 }));
});

test('横线：爆炸只波及同一横行', () => {
  // (2,1)=C 横线 3 点；(2,3)=1 同行；(1,1)=1 同列（不应受波）
  const g = B6(['.1....', '.1....', '.C.1..', '...1..', '......', '......'], 1);
  const r = engine.applyMove(g, 13); // (2,1) →4 爆
  const s = r.state;
  assert.equal(s.cells[13], 0);    // 自身消失
  assert.equal(s.cells[15], 2);    // (2,3) 同行 1+1
  assert.equal(s.cells[7], 1);     // (1,1) 同列不受波
  assert.equal(s.cells[1], 1);     // (0,1) 同列不受波
  assert.equal(s.cells[21], 1);    // (3,3) 不同行不受波
  assert.equal(r.trace.waves.length, 1);
  const targets = r.trace.waves[0].boosts.map(b => b.to);
  assert.ok(!targets.includes(7) && !targets.includes(1), '波只发向同行');
});

test('竖线：爆炸只波及同一纵列', () => {
  // (1,2)=E 竖线 2 点，投两次 → 爆，波及 (0,2)(2,2)(3,2)(5,2)
  let g = B6(['..1...', '..E...', '..2...', '..1...', '......', '..1...'], 9);
  let r = engine.applyMove(g, 8); // 2→3
  r = engine.applyMove(r.state, 8); // 3→4 爆
  const s = r.state;
  assert.equal(s.cells[8], 0);
  assert.equal(s.cells[2], 2);  // (0,2)
  assert.equal(s.cells[14], 3); // (2,2)
  assert.equal(s.cells[20], 2); // (3,2)
  assert.equal(s.cells[32], 2); // (5,2)
  assert.equal(s.cells[9], 0);  // (1,3) 同行空格不生棋
  assert.equal(r.trace.waves.length, 1);
});

test('三角 ▲：整行 + 上半列（T 字形）', () => {
  // (2,2)=H ▲ 2 点；(2,4)=1 同行；(1,2)=2 同列上半；(0,2)=1 同列上半；(3,2)=1 同列下半（不受波）
  let g = B6(['..1...', '..2...', '..H.1.', '..1...', '......', '......'], 9);
  let r = engine.applyMove(g, 14); // 2→3 不爆
  r = engine.applyMove(r.state, 14); // →4 爆
  const s = r.state;
  assert.equal(s.cells[14], 0);   // 自身
  assert.equal(s.cells[16], 2);   // (2,4) 同行 1+1
  assert.equal(s.cells[8], 3);    // (1,2) 上半列 2+1
  assert.equal(s.cells[2], 2);    // (0,2) 上半列 1+1
  assert.equal(s.cells[20], 1);   // (3,2) 下半列不受波
  assert.equal(s.cells[12], 0);   // (2,0) 空格不生棋
});

test('三角 ▼：整行 + 下半列', () => {
  // (1,1)=K ▼ 2 点；(1,3)=1 同行；(2,1)=1 下半列；(0,1)=1 上半列不受波
  let g = B6(['.1....', '.K.1..', '.1....', '.1....', '......', '......'], 9);
  let r = engine.applyMove(g, 7); // 2→3
  r = engine.applyMove(r.state, 7); // →4 爆
  const s = r.state;
  assert.equal(s.cells[7], 0);
  assert.equal(s.cells[9], 2);   // (1,3) 同行
  assert.equal(s.cells[13], 2);  // (2,1) 下半列
  assert.equal(s.cells[19], 2);  // (3,1) 下半列
  assert.equal(s.cells[1], 1);   // (0,1) 上半列不受波
});

test('方框：爆炸波及周围一圈 8 邻域', () => {
  // (2,2)=T ■ 2 点：邻圈 (1,1)(1,2)(1,3)(2,1)(2,3)(3,1)(3,2)(3,3) 各 +1；
  // (0,0) 与 (2,4) 不受波。
  let g = B6(['.111..', '.111..', '.1T1..', '.111..', '..1...', '......'], 9);
  let r = engine.applyMove(g, 14); // 2→3 不爆
  r = engine.applyMove(r.state, 14); // →4 爆
  const s = r.state;
  assert.equal(s.cells[14], 0);
  assert.equal(s.cells[7], 2);   // (1,1)
  assert.equal(s.cells[8], 2);   // (1,2)
  assert.equal(s.cells[9], 2);   // (1,3)
  assert.equal(s.cells[13], 2);  // (2,1)
  assert.equal(s.cells[15], 2);  // (2,3)
  assert.equal(s.cells[19], 2);  // (3,1)
  assert.equal(s.cells[20], 2);  // (3,2)
  assert.equal(s.cells[21], 2);  // (3,3)
  assert.equal(s.cells[0], 0);   // (0,0) 角外
  assert.equal(s.cells[16], 0);  // (2,4) 圈外
  assert.equal(r.trace.waves[0].boosts.length, 8);
  assert.ok(r.trace.waves[0].boosts.every(b => b.dist === 1), '邻圈 dist 均为 1');
});

test('+1 保持形状不变；四点后爆掉', () => {
  let g = B6(['..T...', '......', '......', '......', '......', '...U..'], 9);
  let r = engine.applyMove(g, 2); // ■ 2→3
  assert.equal(engine.kindOf(r.state.cells[2]), 7);
  assert.equal(engine.pointsOf(r.state.cells[2]), 3);
  r = engine.applyMove(r.state, 33); // 另一颗 ■ 3→4 爆（(5,3)，圈外无棋，纯爆）
  assert.equal(r.state.cells[33], 0);
  assert.ok(engine.validateState(r.state));
});

test('形状混战：方框引爆十字，连锁保持 kind 一致性', () => {
  // (2,2)=T ■2，(2,3)=3 普通，(2,4)=2 普通，(3,3)=2 普通
  let g = B6(['......', '......', '..T32.', '...2..', '......', '......'], 9);
  let r = engine.applyMove(g, 14); // ■ 2→3
  r = engine.applyMove(r.state, 14); // ■ →4 爆：邻圈 (2,3)=3→4、(3,3)=2→3
  // 波2：(2,3) 十字爆 → (2,4) 2+1=3、(3,3) 3+1=4
  // 波3：(3,3) 十字爆 → 波及处皆空，连锁结束
  const s = r.state;
  assert.equal(s.cells[14], 0);
  assert.equal(s.cells[15], 0);   // (2,3) 爆掉
  assert.equal(s.cells[21], 0);   // (3,3) 爆掉
  assert.equal(s.cells[16], 3);   // (2,4) 被 (2,3) 行波 +1
  assert.equal(engine.kindOf(s.cells[16]), 0, '普通棋保持 cross');
  assert.equal(r.trace.waves.length, 3);
  assert.equal(r.trace.waves[0].boosts.length, 2);
  assert.equal(r.trace.waves[0].boosts[0].k, 7, '波源为方框');
  assert.equal(r.trace.waves[1].boosts.length, 2);
  assert.equal(r.trace.waves[1].boosts[0].k, 0, '波源为十字');
  assert.equal(r.trace.waves[2].boosts.length, 0);
});

test('三角朝向：◀ 整列+左半行，▶ 整列+右半行', () => {
  // ◀ (2,2)=N 2 点：整列 + 左半行
  let g = B6(['..1...', '......', '.1N1..', '..1...', '......', '......'], 9);
  let r = engine.applyMove(g, 14);
  r = engine.applyMove(r.state, 14); // N →4 爆
  let s = r.state;
  assert.equal(s.cells[13], 2, '◀ 左半行 (2,1) 受波');
  assert.equal(s.cells[15], 1, '◀ 右半行 (2,3) 不受波');
  assert.equal(s.cells[2], 2, '◀ 整列 (0,2) 受波');
  assert.equal(s.cells[20], 2, '◀ 整列 (3,2) 受波');

  // ▶ (2,2)=Q 2 点：整列 + 右半行
  g = B6(['..1...', '......', '.1Q1..', '..1...', '......', '......'], 9);
  r = engine.applyMove(g, 14);
  r = engine.applyMove(r.state, 14); // Q →4 爆
  s = r.state;
  assert.equal(s.cells[13], 1, '▶ 左半行不受波');
  assert.equal(s.cells[15], 2, '▶ 右半行受波');
  assert.equal(s.cells[2], 2, '▶ 整列受波');
});

test('shapeTargets：各形状目标数与边界正确', () => {
  const E = engine;
  // 6×6 棋盘中心 (3,3)=21
  assert.equal(E.shapeTargets(6, 21, 0).length, 10); // 十字 5+5
  assert.equal(E.shapeTargets(6, 21, 1).length, 5);  // 横线
  assert.equal(E.shapeTargets(6, 21, 2).length, 5);  // 竖线
  assert.equal(E.shapeTargets(6, 21, 3).length, 5 + 3); // ▲ 行+上半列(3)
  assert.equal(E.shapeTargets(6, 21, 4).length, 5 + 2); // ▼ 行+下半列(2)
  assert.equal(E.shapeTargets(6, 21, 5).length, 5 + 3); // ◀ 列+左半行(3)
  assert.equal(E.shapeTargets(6, 21, 6).length, 5 + 2); // ▶ 列+右半行(2)
  assert.equal(E.shapeTargets(6, 21, 7).length, 8);     // ■
  // 边角：■ 在 (0,0) 只剩 3 邻；▲ 在 (0,2) 上半列为空
  assert.equal(E.shapeTargets(6, 0, 7).length, 3);
  assert.equal(E.shapeTargets(6, 2, 3).length, 5 + 0);
  assert.ok(!E.shapeTargets(6, 21, 7).includes(21), '不含自身');
});

test('求解器与特殊形状协同：横线一步清整行', () => {
  // (0,1)=C 横线 3 点 + 同行四颗 3 点：一步引爆整行并连锁全清
  const solver = require('../solver.js');
  const g = B6(['.C333.', '......', '......', '......', '......', '......'], 3);
  const res = solver.solve(g);
  assert.equal(res.depth, 1);
  assert.equal(res.moves[0], 1);
  const fin = solver.replay(g, res.moves);
  assert.ok(fin.over && fin.win);
});

test('求解器置换表键无碰撞（多字符 cells 值）', () => {
  // 旧 join('') 会把 [33,4] 与 [3,34] 混淆；新 join(',') 保证键唯一
  const solver = require('../solver.js');
  const g1 = engine.newGame({ size: 6, board: ['A.....', '......', '......', '......', '......', '..2...'], bank: 5 });
  const r1 = solver.solve(g1);
  assert.ok(r1 && !r1.timeout);
  const fin = solver.replay(g1, r1.moves);
  assert.ok(fin.over && fin.win, 'A（横线1点）与 2 点普通棋互不相干，最浅解 3+2=5 步');
  assert.equal(r1.depth, 5);
});

test('终止性：含特殊形状的随机棋盘同样必然终止', () => {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(4321);
  const CH = '123ABCDEFGHIJKLMNOPQRSTU';
  for (let trial = 0; trial < 300; trial++) {
    const size = 5 + Math.floor(rnd() * 2);
    const board = [];
    for (let r = 0; r < size; r++) {
      let row = '';
      for (let c = 0; c < size; c++) {
        row += rnd() < 0.35 ? CH[Math.floor(rnd() * CH.length)] : '.';
      }
      board.push(row);
    }
    let g = engine.newGame({ size, board, bank: 10, allowPlant: rnd() < 0.5 });
    let steps = 0;
    while (!g.over && steps < 60) {
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
    assert.ok(g.over, '形状局应在有限步内结束 trial=' + trial);
  }
});
