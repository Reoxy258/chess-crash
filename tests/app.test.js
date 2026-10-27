'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers/app-harness.cjs');
const challenge = require('../challenge.js');

function challengeLevel(stage) {
  const firstRow = '.'.repeat(stage % 6) + '3' + '.'.repeat(5 - stage % 6);
  return {
    id: 'C' + stage, mode: 'challenge', chapter: 0,
    title: 'Test stage ' + stage, intro: '', size: 6, bank: 1, par: 1,
    allowPlant: false, board: [firstRow, '......', '......', '......', '......', '......']
  };
}
function bestStage(h) {
  return JSON.parse(h.storage.get('cc-challenge-best-v1') || 'null')?.stage || 0;
}

test('界面正常流程：2-1 通关解锁、存星并释放操作锁', async () => {
  const h = boot();
  h.app.startLevel(5);
  h.get('coach-next').dispatch('click');
  await h.move(7);
  assert.equal(h.app.state.game.win, true);
  assert.equal(h.app.state.busy, false);
  assert.equal(h.app.state.progress.stars['2-1'], 3);
  assert.equal(h.get('overlay').classList.contains('hidden'), false);
});

for (const elapsed of [0, 150, 230]) {
  test('换关取消旧动画及命中回调：16-1 → 2-1，延迟 ' + elapsed + 'ms', async () => {
    const h = boot();
    h.app.startLevel(75);
    const oldMove = h.track(h.app.tryPlay(51));
    await h.advance(elapsed);
    h.app.goMenu();
    h.app.startLevel(5);
    const nextBoard = h.app.state.game.cells.slice();
    await h.until(() => oldMove.done);
    await h.advance(5000);
    assert.equal(oldMove.error, undefined);
    assert.equal(h.app.state.level.id, '2-1');
    assert.equal(h.app.state.busy, false);
    assert.deepEqual(h.app.state.game.cells, nextBoard);
    assert.equal(h.get('overlay').classList.contains('hidden'), true);
    h.get('coach-next').dispatch('click');
    await h.move(7);
    assert.equal(h.app.state.game.win, true, '新局仍可正常落子通关');
  });
}

test('7-1 播种中局提示遵守实际规则，不把无播种搜索失败当作无解', async () => {
  const h = boot();
  h.app.startLevel(30);
  await h.move(16);
  const witness = h.solver.replay(h.app.state.game, [2, 9, 3]);
  assert.equal(witness.win, true, '独立的合法清盘着法证明当前局面有解');
  h.app.giveHint();
  h.app.giveHint();
  await h.advance(100);
  assert.doesNotMatch(h.get('msg').textContent, /已无法清盘/);
  assert.ok(h.get('board').children.some(cell => cell.classList.contains('hint-glow')),
    '这个已知三步可解局面应给出具体提示');
});

test('答案回放从准备到收尾全程保护输入，不受重开、悔棋与落子干扰', async () => {
  const h = boot();
  h.app.startLevel(3);
  const replay = h.track(h.app.revealAnswer());
  let checks = 0;
  while (!replay.done) {
    await h.flush();
    if (replay.done) break;
    assert.equal(h.app.state.busy, true, '包括初始等待与步骤间隔都必须保留回放锁');
    const before = h.app.state.game;
    h.get('btn-restart').dispatch('click');
    h.get('btn-undo').dispatch('click');
    h.app.tryPlay(0);
    assert.equal(h.app.state.game, before);
    checks++;
    assert.ok(checks < 20000);
    assert.equal(await h.next(), true);
  }
  assert.equal(replay.error, undefined);
  assert.ok(checks > 2, '应在多个异步阶段尝试输入');
  assert.equal(h.app.state.game.win, true);
  assert.equal(h.app.state.game.placed, 2);
  assert.equal(h.app.state.busy, false);
  assert.match(h.get('overlay-box').innerHTML, /轮到你了/);
});

for (const phase of ['prepare', 'after-first-move']) {
  test('离开答案回放后不再修改新局或弹出旧完成面板：' + phase, async () => {
    const h = boot();
    h.app.startLevel(3);
    const replay = h.track(h.app.revealAnswer());
    if (phase === 'after-first-move') {
      await h.until(() => h.app.state.game.placed === 1);
      await h.advance(200);
    }
    h.app.goMenu();
    h.app.startLevel(5);
    const nextBoard = h.app.state.game.cells.slice();
    await h.until(() => replay.done);
    await h.advance(5000);
    assert.equal(replay.error, undefined);
    assert.equal(h.app.state.level.id, '2-1');
    assert.equal(h.app.state.busy, false);
    assert.deepEqual(h.app.state.game.cells, nextBoard);
    assert.equal(h.get('overlay').classList.contains('hidden'), true);
    h.get('coach-next').dispatch('click');
    await h.move(7);
    assert.equal(h.app.state.game.win, true);
  });
}

test('挑战下一关生成失败后重开会重新生成目标阶段，不把旧关计作新关', async () => {
  const calls = [];
  const h = boot({ challenge: {
    ...challenge,
    makeChallenge(stage) {
      calls.push(stage);
      if (stage === 1 && calls.filter(value => value === 1).length === 1) return null;
      return challengeLevel(stage);
    }
  } });
  h.app.startChallenge();
  await h.advance(40);
  assert.equal(h.app.state.level.id, 'C0');
  await h.move(0);
  assert.equal(bestStage(h), 1);
  h.get('ov-next').dispatch('click');
  await h.advance(40);
  assert.match(h.get('msg').textContent, /生成失败/);
  assert.equal(bestStage(h), 1);
  h.get('btn-restart').dispatch('click');
  await h.advance(40);
  assert.deepEqual(calls, [0, 1, 1]);
  assert.equal(h.app.state.level.id, 'C1');
  assert.equal(h.app.state.runCtx.stage, 1);
  assert.equal(bestStage(h), 1);
  await h.move(1);
  assert.equal(bestStage(h), 2);
});

test('首次挑战生成失败且没有旧局面时，重开仍可正确重试', async () => {
  const calls = [];
  const h = boot({ challenge: {
    ...challenge,
    makeChallenge(stage) { calls.push(stage); return calls.length === 1 ? null : challengeLevel(stage); }
  } });
  h.app.startChallenge();
  for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']) {
    assert.doesNotThrow(() => h.document.dispatch('keydown', { key }));
  }
  await h.advance(40);
  assert.match(h.get('msg').textContent, /生成失败/);
  for (const key of ['ArrowUp', 'ArrowRight']) {
    assert.doesNotThrow(() => h.document.dispatch('keydown', { key }));
  }
  assert.equal(h.app.state.busy, false);
  h.get('btn-restart').dispatch('click');
  await h.advance(40);
  assert.deepEqual(calls, [0, 0]);
  assert.equal(h.app.state.level.id, 'C0');
  await h.move(0);
  assert.equal(bestStage(h), 1);
});

test('战役入口取代待生成的挑战请求，旧回调不能覆盖新局', async () => {
  const calls = [];
  const h = boot({ challenge: {
    ...challenge,
    makeChallenge(stage) { calls.push(stage); return challengeLevel(stage); }
  } });
  h.app.startChallenge();
  h.app.goMenu();
  h.app.startLevel(5);
  const nextBoard = h.app.state.game.cells.slice();
  await h.advance(5000);
  assert.equal(h.app.state.level.id, '2-1');
  assert.equal(h.app.state.runCtx.mode, 'campaign');
  assert.equal(h.app.state.busy, false);
  assert.deepEqual(h.app.state.game.cells, nextBoard);
  assert.equal(bestStage(h), 0);
  h.get('coach-next').dispatch('click');
  await h.move(7);
  assert.equal(h.app.state.game.win, true);
});

test('战役入口取代待生成的每日挑战请求，旧回调不能覆盖新局', async () => {
  const h = boot({ challenge: {
    ...challenge,
    makeDaily() { return { ...challengeLevel(0), id: 'D-test', mode: 'daily' }; }
  } });
  h.app.startDaily();
  h.app.goMenu();
  h.app.startLevel(5);
  await h.advance(5000);
  assert.equal(h.app.state.level.id, '2-1');
  assert.equal(h.app.state.runCtx.mode, 'campaign');
  assert.equal(h.app.state.busy, false);
  h.get('coach-next').dispatch('click');
  await h.move(7);
  assert.equal(h.app.state.game.win, true);
});

test('单步动画异常后恢复已结算棋盘并释放锁，后续仍能通关', async () => {
  const h = boot();
  h.app.startLevel(3);
  const firstCell = h.get('board').children[0];
  const measure = firstCell.getBoundingClientRect.bind(firstCell);
  let failOnce = true;
  firstCell.getBoundingClientRect = () => {
    if (failOnce) { failOnce = false; throw new Error('injected layout failure'); }
    return measure();
  };
  await h.move(25);
  assert.equal(h.app.state.busy, false);
  assert.equal(h.app.state.game.placed, 1);
  assert.equal(h.app.state.game.win, false);
  await h.move(5);
  assert.equal(h.app.state.game.win, true);
  assert.equal(h.app.state.progress.stars['1-4'], 3);
});

/* ============ v1.7.9 连胜节奏回归 ============ */
function levelGame(h, levelIdx) {
  const lv = h.levels.LEVELS[levelIdx];
  return h.engine.newGame({ size: lv.size, board: lv.board, bank: lv.bank, allowPlant: lv.allowPlant });
}
function firstWinIndex(h, levelIdx) {
  const g = levelGame(h, levelIdx);
  for (let i = 0; i < g.cells.length; i++) {
    const r = h.engine.applyMove(g, i);
    if (r.ok && r.state.win) return i;
  }
  throw new Error('no winning move for ' + h.levels.LEVELS[levelIdx].id);
}
function overlayTitle(h) {
  const m = h.get('overlay-box').innerHTML.match(/<h2[^>]*>([^<]*)<\/h2>/);
  return m ? m[1] : null;
}

test('v1.7.9 三连胜起每一胜都庆祝：第 1、2 胜普通弹窗，第 3、4、5 胜金色庆典', async () => {
  const h = boot();
  h.app.startLevel(5);                        /* 2-1 */
  const winIdx = firstWinIndex(h, 5);
  const streaks = [];
  const boxes = [];
  const titles = [];
  for (let round = 1; round <= 5; round++) {
    h.get('coach-next').dispatch('click');    /* 首局 debut 教学与重开后的教学都关掉 */
    await h.move(winIdx);
    streaks.push(h.app.state.progress.streak);
    boxes.push(h.get('overlay-box').classList.contains('streak'));
    titles.push(overlayTitle(h));
    h.get('ov-retry').dispatch('click');      /* 再玩一次：胜利不清零连胜 */
  }
  assert.deepEqual(streaks, [1, 2, 3, 4, 5]);
  assert.deepEqual(boxes, [false, false, true, true, true]);
  assert.deepEqual(titles, ['清空棋盘！', '清空棋盘！', '三连胜！', '四连胜！', '五连胜！']);
});

test('v1.7.9 败局清零连胜，重置后首胜回到普通弹窗', async () => {
  const h = boot();
  /* 连胜两局：2-1 → 2-2 */
  h.app.startLevel(5);
  h.get('coach-next').dispatch('click');
  await h.move(firstWinIndex(h, 5));
  h.get('ov-next').dispatch('click');
  h.get('coach-next').dispatch('click');
  await h.move(firstWinIndex(h, 6));
  assert.equal(h.app.state.progress.streak, 2);
  /* 2-3 花光点数不清盘 → 败局清零 */
  h.get('ov-next').dispatch('click');
  let sim = levelGame(h, 7);
  const waste = [];
  while (!sim.over) {
    let stepped = false;
    for (let i = 0; i < sim.cells.length; i++) {
      const r = h.engine.applyMove(sim, i);
      if (r.ok && !r.state.win) { waste.push(i); sim = r.state; stepped = true; break; }
    }
    if (!stepped) break;
  }
  assert.equal(sim.over, true, '模拟应走到终局');
  assert.equal(sim.win, false, '模拟应为败局');
  for (const idx of waste) await h.move(idx);
  assert.equal(overlayTitle(h), '点数用完了');
  assert.equal(h.app.state.progress.streak, 0, '败局清零连胜');
  /* 重试 → solver 整解通关 → 回 streak 1 普通弹窗 */
  h.get('ov-retry').dispatch('click');
  const solve = h.solver.solve(levelGame(h, 7), { timeBudget: 3000 });
  assert.ok(solve && solve.moves && solve.moves.length, '2-3 应有整解');
  for (const mv of solve.moves) await h.move(mv);
  assert.equal(h.app.state.progress.streak, 1);
  assert.equal(h.get('overlay-box').classList.contains('streak'), false);
  assert.equal(overlayTitle(h), '清空棋盘！');
});
