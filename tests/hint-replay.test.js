/* 设计解快速路径回归：全部 80 关的候选解、回放与中局检查
 *
 * 背景：第七章起关卡开放播种，运行时带播种的搜索分支爆炸（9×9 深关初始求解
 * 分钟级）——9-4 提示 450ms 必超时且旧代码静默吞掉；答案回放 4s 预算恰好超时，
 * for...of undefined 抛 TypeError、busy 卡死整盘。修复：solveState() 统一按
 * par 的设计语义求解（播种章六/十一带播种，其余战役关关闭播种），实测全部
 * 本文件只验证设计解候选路径。v1.7.8 的提示会在该路径无解时补算实际规则，
 * 不再把受限搜索失败当作真实局面无解；实际界面流程另见 app.test.js。
 */
const test = require('node:test');
const assert = require('node:assert');
const engine = require('../engine.js');
const solver = require('../solver.js');
const { LEVELS } = require('../levels.js');

const PLANT_CHAPTERS = [6, 11];

/* 设计解候选状态；不可用它的 null 证明实际播种玩法无解。 */
function designGame(lv) {
  const g = engine.newGame({ size: lv.size, board: lv.board, bank: lv.bank, allowPlant: !!lv.allowPlant });
  const s = engine.clone(g);
  s.allowPlant = !!lv.allowPlant && PLANT_CHAPTERS.includes(lv.chapter);
  return s;
}

/* 设计解候选的两级预算：450ms 快解，超时升 6s 深算。 */
function hintSolve(lv) {
  let res = solver.solve(designGame(lv), { timeBudget: 450 });
  if (res && res.timeout) res = solver.solve(designGame(lv), { timeBudget: 6000 });
  return res;
}

test('提示：80 关初始局面按两级预算必出一手（无超时、非空）', () => {
  for (const lv of LEVELS) {
    const res = hintSolve(lv);
    assert.ok(!res.timeout, lv.id + ' 提示深算后仍超时');
    assert.ok(res.moves && res.moves.length, lv.id + ' 提示必须给出一手');
    assert.ok(res.moves[0] >= 0 && res.moves[0] < lv.size * lv.size, lv.id + ' 提示着法在盘内');
  }
});

test('答案回放：80 关初始局面 12s 内整解，回放到原局面必胜', () => {
  for (const lv of LEVELS) {
    const res = solver.solve(designGame(lv), { timeBudget: 12000 });
    assert.ok(!res.timeout, lv.id + ' 回放求解不得超时');
    assert.ok(res.moves && res.moves.length, lv.id + ' 必须有整解');
    const g = engine.newGame({ size: lv.size, board: lv.board, bank: lv.bank, allowPlant: !!lv.allowPlant });
    const fin = solver.replay(g, res.moves);
    assert.ok(fin && fin.over && fin.win, lv.id + ' 答案回放到原局面必胜');
    assert.equal(res.depth, lv.par, lv.id + ' 设计解深度应恰为 par');
  }
});

test('中局提示：跟着设计解走 1-2 步后仍可解（提示链不中断）', () => {
  for (const lv of LEVELS) {
    const res = hintSolve(lv);
    let g = engine.newGame({ size: lv.size, board: lv.board, bank: lv.bank, allowPlant: !!lv.allowPlant });
    let ok = true;
    for (let k = 0; k < Math.min(2, res.moves.length); k++) {
      const r = engine.applyMove(g, res.moves[k]);
      if (!r.ok || r.state.over) { ok = false; break; }
      g = r.state;
    }
    if (!ok || g.over) continue;
    const s = engine.clone(g);
    s.allowPlant = !!lv.allowPlant && PLANT_CHAPTERS.includes(lv.chapter);
    const r2 = solver.solve(s, { timeBudget: 6000 });
    assert.ok(r2 && !r2.timeout, lv.id + ' 在路径中局求解不得超时');
    assert.ok(r2.moves && r2.moves.length, lv.id + ' 在路径中局仍须可解');
  }
});

test('中局兜底：垃圾着后的结果（无解 null / 超时 / 有解）都形态合法且无害', () => {
  for (const lv of LEVELS) {
    const base = engine.newGame({ size: lv.size, board: lv.board, bank: lv.bank, allowPlant: !!lv.allowPlant });
    /* 点一个「非设计首着」的有效格（有棋子处随便点）制造偏离局面 */
    const alt = base.cells.findIndex((v, i) => v > 0 && i !== hintSolve(lv).moves[0]);
    if (alt < 0) continue;
    const r = engine.applyMove(base, alt);
    if (!r.ok || r.state.over) continue;
    const s = engine.clone(r.state);
    s.allowPlant = !!lv.allowPlant && PLANT_CHAPTERS.includes(lv.chapter);
    const out = solver.solve(s, { timeBudget: 6000 });
    /* 三种合法结果：null（确证无解，提示给「无法清盘」文案）、{timeout}（给「算不动」）、
     * {moves}（给出提示）。任何一种都不得让调用方崩（旧 bug 即形态未处理）。 */
    if (out === null) continue;
    assert.ok(out.timeout || (out.moves && out.moves.every(m => m >= 0 && m < lv.size * lv.size)),
      lv.id + ' 偏离局面求解结果形态合法');
    if (!out.timeout && out.moves && out.moves.length) {
      const fin = solver.replay(engine.clone(r.state), out.moves);
      assert.ok(fin && fin.over && fin.win, lv.id + ' 偏离局面提示解回放必胜');
    }
  }
});

test('9-4 专项：设计语义初始求解亚秒级、带播种才是分钟级（回归锚点）', () => {
  const lv = LEVELS.find(l => l.id === '9-4');
  assert.ok(lv, '9-4 存在');
  assert.equal(lv.par, 5);
  /* 设计语义（无播种）：提示与回放都用这条路径，必须在快解预算内完成 */
  const t0 = Date.now();
  const res = solver.solve(designGame(lv), { timeBudget: 450 });
  const ms = Date.now() - t0;
  assert.ok(!res.timeout, '9-4 设计语义求解不得超时（实际 ' + ms + 'ms）');
  assert.equal(res.depth, 5, '9-4 设计解恰 5 步');
  const fin = solver.replay(
    engine.newGame({ size: lv.size, board: lv.board, bank: lv.bank, allowPlant: true }),
    res.moves
  );
  assert.ok(fin && fin.win && fin.cells.every(c => c === 0), '9-4 设计解在开放播种的原局面回放必胜');
});
