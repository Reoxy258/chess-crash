/* 关卡数据回归：结构合法、50 关、solver 复算 par、回放必胜、章节规则 */
const test = require('node:test');
const assert = require('node:assert');
const engine = require('../engine.js');
const solver = require('../solver.js');
const { LEVELS, CHAPTERS, starFor, unlocked } = require('../levels.js');

test('共 50 关、10 章、id 唯一', () => {
  assert.equal(LEVELS.length, 50);
  assert.equal(Object.keys(CHAPTERS).length, 10);
  assert.equal(new Set(LEVELS.map(l => l.id)).size, 50);
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
      assert.ok(/^[.123A-U]+$/.test(row), l.id + ' 字符集');
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

test('章节规则：第一章入门、第三章手紧、第五章播种、第六章综合', () => {
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
    assert.ok(l.par >= 4 && l.size >= 8, l.id + ' 第六章规模与深度');
  }
});

test('形状章节规则：七直线、八三角、九方框、终章混合', () => {
  const by = id => LEVELS.find(l => l.id === id);
  // 教学关：一步全清
  for (const id of ['7-1', '7-2', '8-1', '9-1']) {
    assert.equal(by(id).par, 1, id + ' 教学关 par 1');
    assert.equal(by(id).bank, 1, id + ' 教学关 bank 1');
  }
  const hasKind = (l, re) => l.board.some(row => re.test(row));
  // 第七章：仅横线/竖线特殊棋（A-F），且每个随机关必含
  for (const l of LEVELS.filter(x => x.chapter === 7)) {
    assert.ok(!hasKind(l, /[G-U]/), l.id + ' 第七章不含三角/方框');
    assert.ok(hasKind(l, /[A-F]/), l.id + ' 第七章必含直线棋');
  }
  // 第八章：仅三角（G-R），随机关必含
  for (const l of LEVELS.filter(x => x.chapter === 8)) {
    assert.ok(!hasKind(l, /[A-F]/) && !hasKind(l, /[S-U]/), l.id + ' 第八章不含直线/方框');
    assert.ok(hasKind(l, /[G-R]/), l.id + ' 第八章必含三角');
  }
  // 第九章：9-2~9-4 仅方框；9-5 章末混合
  for (const l of LEVELS.filter(x => x.chapter === 9 && x.id !== '9-5')) {
    assert.ok(!hasKind(l, /[A-R]/), l.id + ' 第九章不含直线/三角');
    assert.ok(hasKind(l, /[S-U]/), l.id + ' 第九章必含方框');
  }
  assert.ok(hasKind(by('9-5'), /[S-U]/), '9-5 混合关含方框');
  // 终章：四类齐全
  for (const l of LEVELS.filter(x => x.chapter === 10)) {
    assert.ok(hasKind(l, /[A-F]/) && hasKind(l, /[G-R]/) && hasKind(l, /[S-U]/), l.id + ' 终章四类形状齐全');
    assert.ok(l.par >= 4, l.id + ' 终章 par ≥ 4');
  }
});

test('非教学关无意外单步解（par > 1 已由复算保证）', () => {
  const teaching = ['1-1', '7-1', '7-2', '8-1', '9-1'];
  for (const l of LEVELS.filter(x => x.chapter >= 2 && !teaching.includes(x.id))) {
    assert.ok(l.par >= 2, l.id + ' 非教学关 par ≥ 2');
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
