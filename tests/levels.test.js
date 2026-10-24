/* 关卡数据回归：结构合法、80 关、solver 复算 par、回放必胜、章节规则 */
const test = require('node:test');
const assert = require('node:assert');
const engine = require('../engine.js');
const solver = require('../solver.js');
const { LEVELS, CHAPTERS, starFor, unlocked } = require('../levels.js');

test('共 80 关、16 章、id 唯一', () => {
  assert.equal(LEVELS.length, 80);
  assert.equal(Object.keys(CHAPTERS).length, 16);
  assert.equal(new Set(LEVELS.map(l => l.id)).size, 80);
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

test('章节规则：前两章原味、手紧与播种各就各位', () => {
  const by = id => LEVELS.find(l => l.id === id);
  assert.equal(by('1-1').par, 1);
  assert.equal(by('1-1').bank, 1);
  // 第一、二章为 v1.2.0 原关：纯普通棋（无形状字母）
  for (const l of LEVELS.filter(x => x.chapter <= 2)) {
    assert.ok(l.board.every(r => /^[.123]+$/.test(r)), l.id + ' 前两章纯普通棋');
    assert.ok(l.par <= 3, l.id + ' 前两章 par ≤ 3');
  }
  // 手紧章（四、十、十四）：bank === par
  for (const l of LEVELS.filter(x => [4, 10, 14].includes(x.chapter))) {
    assert.equal(l.bank, l.par, l.id + ' 手紧章 bank === par');
  }
  // 播种章（七、十二）：允许播种且最浅解必含播种步
  for (const l of LEVELS.filter(x => [7, 12].includes(x.chapter))) {
    assert.ok(l.allowPlant, l.id + ' 播种章允许播种');
    const g = engine.newGame({ size: l.size, board: l.board, bank: l.bank, allowPlant: true });
    const res = solver.solve(g, { timeBudget: 10000 });
    assert.ok(res.moves.some(i => g.cells[i] === 0), l.id + ' 最浅解必含播种步');
  }
  // 大盘章（十一起 ≥ 8×8；十三/十五/终章 9×9）
  for (const l of LEVELS.filter(x => x.chapter >= 11)) {
    assert.ok(l.size >= 8, l.id + ' 深章 ≥ 8×8');
    assert.ok(l.par >= 4, l.id + ' 深章 par ≥ 4');
  }
  for (const l of LEVELS.filter(x => [13, 15, 16].includes(x.chapter))) {
    assert.equal(l.size, 9, l.id + ' 9×9');
  }
});

test('形状章节规则：形状自第三章登场、逐章递进', () => {
  const by = id => LEVELS.find(l => l.id === id);
  // 教学关：一步全清
  for (const id of ['1-1', '3-1', '3-2', '5-1', '8-1']) {
    assert.equal(by(id).par, 1, id + ' 教学关 par 1');
    assert.equal(by(id).bank, 1, id + ' 教学关 bank 1');
  }
  const hasKind = (l, re) => l.board.some(row => re.test(row));
  // 第三章：仅横线/竖线（A-F），每关必含
  for (const l of LEVELS.filter(x => x.chapter === 3)) {
    assert.ok(!hasKind(l, /[G-U]/), l.id + ' 第三章无三角/方框');
    assert.ok(hasKind(l, /[A-F]/), l.id + ' 第三章必含直线棋');
  }
  // 第四章：手紧 + 仅直线
  for (const l of LEVELS.filter(x => x.chapter === 4)) {
    assert.ok(!hasKind(l, /[G-U]/), l.id + ' 第四章无三角/方框');
    assert.ok(hasKind(l, /[A-F]/), l.id + ' 第四章必含直线棋');
  }
  // 第五章：仅三角（G-R）
  for (const l of LEVELS.filter(x => x.chapter === 5)) {
    assert.ok(!hasKind(l, /[A-F]/) && !hasKind(l, /[S-U]/), l.id + ' 第五章无直线/方框');
    assert.ok(hasKind(l, /[G-R]/), l.id + ' 第五章必含三角');
  }
  // 第六章：6-1 直线热身，其余直线 + 三角（无方框）
  for (const l of LEVELS.filter(x => x.chapter === 6)) {
    assert.ok(!hasKind(l, /[S-U]/), l.id + ' 第六章无方框');
    assert.ok(hasKind(l, /[A-F]/), l.id + ' 第六章含直线');
  }
  for (const l of LEVELS.filter(x => x.chapter === 6 && x.id !== '6-1')) {
    assert.ok(hasKind(l, /[G-R]/), l.id + ' 第六章含三角');
  }
  // 第八章：8-2~8-4 仅方框；8-5 混入直线
  for (const l of LEVELS.filter(x => x.chapter === 8 && x.id !== '8-5')) {
    assert.ok(!hasKind(l, /[A-R]/), l.id + ' 第八章不含直线/三角');
    assert.ok(hasKind(l, /[S-U]/), l.id + ' 第八章必含方框');
  }
  assert.ok(hasKind(by('8-5'), /[S-U]/) && hasKind(by('8-5'), /[A-F]/), '8-5 混合关含方框+直线');
  // 第九章起：四类齐全
  for (const l of LEVELS.filter(x => x.chapter >= 9)) {
    assert.ok(hasKind(l, /[A-F]/) && hasKind(l, /[G-R]/) && hasKind(l, /[S-U]/), l.id + ' 四类形状齐全');
  }
});

test('非教学关无意外单步解（par > 1 已由复算保证）', () => {
  const teaching = ['1-1', '1-2', '1-3', '3-1', '3-2', '5-1', '8-1'];
  for (const l of LEVELS.filter(x => !teaching.includes(x.id))) {
    assert.ok(l.par >= 2, l.id + ' 非教学关 par ≥ 2');
  }
});
