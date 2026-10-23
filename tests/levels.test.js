/* 关卡数据回归：结构合法、30 关、solver 复算 par、回放必胜、章节规则 */
const test = require('node:test');
const assert = require('node:assert');
const engine = require('../engine.js');
const solver = require('../solver.js');
const { LEVELS, CHAPTERS, starFor, unlocked } = require('../levels.js');

test('共 30 关、6 章、id 唯一', () => {
  assert.equal(LEVELS.length, 30);
  assert.equal(Object.keys(CHAPTERS).length, 6);
  assert.equal(new Set(LEVELS.map(l => l.id)).size, 30);
  for (const l of LEVELS) {
    assert.ok(CHAPTERS[l.chapter], l.id + ' 有章节名');
    assert.ok(l.title && l.intro, l.id + ' 有标题与文案');
  }
});

test('棋盘编码合法（尺寸、字符、稳定态）', () => {
  for (const l of LEVELS) {
    assert.equal(l.board.length, l.size, l.id);
    for (const row of l.board) {
      assert.equal(row.length, l.size, l.id + ' 行宽');
      assert.ok(/^[.123]+$/.test(row), l.id + ' 字符集');
    }
  }
});

test('solver 复算：最优投点数与 par 一致，解回放必胜', () => {
  for (const l of LEVELS) {
    const g = engine.newGame({ size: l.size, board: l.board, bank: l.bank, allowPlant: l.allowPlant });
    const res = solver.solve(g, { timeBudget: 10000 });
    assert.ok(res, l.id + ' 必须可解');
    assert.ok(!res.timeout, l.id + ' 不得超时');
    assert.equal(res.depth, l.par, l.id + ' par 匹配');
    const fin = solver.replay(g, res.moves);
    assert.ok(fin.over && fin.win, l.id + ' 解回放必胜');
    assert.ok(l.bank >= l.par, l.id + ' bank ≥ par');
  }
});

test('章节规则：第一章入门、第三章手紧、第五章播种、终章综合', () => {
  const by = id => LEVELS.find(l => l.id === id);
  assert.equal(by('1-1').par, 1);
  assert.equal(by('1-1').bank, 1);
  for (const l of LEVELS.filter(x => x.chapter === 1)) {
    assert.ok(l.par <= 2, l.id + ' 第一章 par ≤ 2');
  }
  for (const l of LEVELS.filter(x => x.chapter === 3)) {
    assert.equal(l.bank, l.par, l.id + ' 第三章 bank === par');
  }
  for (const l of LEVELS.filter(x => x.chapter === 5)) {
    assert.ok(l.allowPlant, l.id + ' 第五章允许播种');
    const g = engine.newGame({ size: l.size, board: l.board, bank: l.bank, allowPlant: true });
    const res = solver.solve(g);
    assert.ok(res.moves.some(i => g.cells[i] === 0), l.id + ' 最浅解必含播种步');
  }
  for (const l of LEVELS.filter(x => x.chapter === 6)) {
    assert.ok(l.par >= 4 && l.size >= 8, l.id + ' 终章规模与深度');
  }
});

test('非教学章无意外单步解（par > 1 已由复算保证）', () => {
  for (const l of LEVELS.filter(x => x.chapter >= 2)) {
    assert.ok(l.par >= 2, l.id + ' 非教学章 par ≥ 2');
  }
});

test('星级与解锁逻辑', () => {
  const lv = { par: 2 };
  assert.equal(starFor(lv, 2), 3);
  assert.equal(starFor(lv, 3), 2);
  assert.equal(starFor(lv, 9), 1);
  const stars = { '1-1': 1 };
  assert.equal(unlocked(LEVELS, 0, stars), true);
  assert.equal(unlocked(LEVELS, 1, stars), true);
  assert.equal(unlocked(LEVELS, 2, stars), false);
});
