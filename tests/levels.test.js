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
    // v1.7.0 播种开放：par = 设计最优。播种章（六、十一）的 par 含播种步（求解带播种）；
    // 其余章节按无播种设计——开放播种只是给玩家的额外工具（只增不减可解性），
    // 偶尔能让熟练玩家比 par 更省点拿到三星，属于预期的宽松。
    const parPlant = [6, 11].includes(l.chapter);
    const g = engine.newGame({ size: l.size, board: l.board, bank: l.bank, allowPlant: parPlant });
    const res = solver.solve(g, { timeBudget: 10000 });
    assert.ok(res, l.id + ' 必须可解');
    assert.ok(!res.timeout, l.id + ' 不得超时');
    assert.equal(res.depth, l.par, l.id + ' par 匹配');
    const fin = solver.replay(g, res.moves);
    assert.ok(fin.over && fin.win, l.id + ' 解回放必胜');
    assert.ok(l.bank >= l.par, l.id + ' bank ≥ par');
  }
});

test('章节规则：第一章原味、手紧与播种各就各位', () => {
  const by = id => LEVELS.find(l => l.id === id);
  assert.equal(by('1-1').par, 1);
  assert.equal(by('1-1').bank, 1);
  // 第一章为 v1.2.0 原关：纯普通棋（无形状字母），前 5 关逐字节复现保进度
  for (const l of LEVELS.filter(x => x.chapter === 1)) {
    assert.ok(l.board.every(r => /^[.123]+$/.test(r)), l.id + ' 第一章纯普通棋');
    assert.ok(l.par <= 3, l.id + ' 第一章 par ≤ 3');
  }
  // 手紧章（九、十三）：bank === par
  for (const l of LEVELS.filter(x => [9, 13].includes(x.chapter))) {
    assert.equal(l.bank, l.par, l.id + ' 手紧章 bank === par');
  }
  // 播种章（六、十一）：允许播种且最浅解必含播种步
  for (const l of LEVELS.filter(x => [6, 11].includes(x.chapter))) {
    assert.ok(l.allowPlant, l.id + ' 播种章允许播种');
    const g = engine.newGame({ size: l.size, board: l.board, bank: l.bank, allowPlant: true });
    const res = solver.solve(g, { timeBudget: 10000 });
    assert.ok(res.moves.some(i => g.cells[i] === 0), l.id + ' 最浅解必含播种步');
  }
  // v1.7.0 播种开放：播种在第六章登场后，第七章起全部开放；前五章不开放
  for (const l of LEVELS.filter(x => x.chapter >= 6)) {
    assert.ok(l.allowPlant, l.id + ' 第六章起可播种');
  }
  for (const l of LEVELS.filter(x => x.chapter <= 5)) {
    assert.ok(!l.allowPlant, l.id + ' 前五章不可播种');
  }
  // 大盘章（十起 ≥ 8×8；十二/十四/十五/终章 9×9）
  for (const l of LEVELS.filter(x => x.chapter >= 10)) {
    assert.ok(l.size >= 8, l.id + ' 深章 ≥ 8×8');
    assert.ok(l.par >= 4, l.id + ' 深章 par ≥ 4');
  }
  for (const l of LEVELS.filter(x => [12, 14, 15, 16].includes(x.chapter))) {
    assert.equal(l.size, 9, l.id + ' 9×9');
  }
});

test('形状章节规则：形状自第二章登场、逐章递进（v1.5.0 提前）', () => {
  const by = id => LEVELS.find(l => l.id === id);
  // 教学关：一步全清
  for (const id of ['1-1', '2-1', '2-2', '3-1', '4-1']) {
    assert.equal(by(id).par, 1, id + ' 教学关 par 1');
    assert.equal(by(id).bank, 1, id + ' 教学关 bank 1');
  }
  const hasKind = (l, re) => l.board.some(row => re.test(row));
  // 第二章：仅横线/竖线（A-F），每关必含
  for (const l of LEVELS.filter(x => x.chapter === 2)) {
    assert.ok(!hasKind(l, /[G-U]/), l.id + ' 第二章无三角/方框');
    assert.ok(hasKind(l, /[A-F]/), l.id + ' 第二章必含直线棋');
  }
  // 第三章：仅三角（G-R）
  for (const l of LEVELS.filter(x => x.chapter === 3)) {
    assert.ok(!hasKind(l, /[A-F]/) && !hasKind(l, /[S-U]/), l.id + ' 第三章无直线/方框');
    assert.ok(hasKind(l, /[G-R]/), l.id + ' 第三章必含三角');
  }
  // 第四章：4-2~4-4 仅方框；4-5 混入直线
  for (const l of LEVELS.filter(x => x.chapter === 4 && x.id !== '4-5')) {
    assert.ok(!hasKind(l, /[A-R]/), l.id + ' 第四章不含直线/三角');
    assert.ok(hasKind(l, /[S-U]/), l.id + ' 第四章必含方框');
  }
  assert.ok(hasKind(by('4-5'), /[S-U]/) && hasKind(by('4-5'), /[A-F]/), '4-5 混合关含方框+直线');
  // 第五章：四类齐全
  for (const l of LEVELS.filter(x => x.chapter === 5)) {
    assert.ok(hasKind(l, /[A-F]/) && hasKind(l, /[G-R]/) && hasKind(l, /[S-U]/), l.id + ' 四类形状齐全');
  }
  // 第六章（播种）：无方框；6-1/6-2 直线热身，6-3 起混三角
  for (const l of LEVELS.filter(x => x.chapter === 6)) {
    assert.ok(!hasKind(l, /[S-U]/), l.id + ' 第六章无方框');
    assert.ok(hasKind(l, /[A-F]/), l.id + ' 第六章含直线');
  }
  for (const l of LEVELS.filter(x => x.chapter === 6 && !['6-1', '6-2'].includes(x.id))) {
    assert.ok(hasKind(l, /[G-R]/), l.id + ' 第六章含三角');
  }
  // 第七章（队形）：直线 + 三角，无方框；7-1 直线热身
  for (const l of LEVELS.filter(x => x.chapter === 7)) {
    assert.ok(!hasKind(l, /[S-U]/), l.id + ' 第七章无方框');
    assert.ok(hasKind(l, /[A-F]/), l.id + ' 第七章含直线');
  }
  for (const l of LEVELS.filter(x => x.chapter === 7 && x.id !== '7-1')) {
    assert.ok(hasKind(l, /[G-R]/), l.id + ' 第七章含三角');
  }
  // 第八章起：方框必在场
  for (const l of LEVELS.filter(x => x.chapter >= 8)) {
    assert.ok(hasKind(l, /[S-U]/), l.id + ' 方框必在场');
  }
  // 第九章起：四类齐全
  for (const l of LEVELS.filter(x => x.chapter >= 9)) {
    assert.ok(hasKind(l, /[A-F]/) && hasKind(l, /[G-R]/) && hasKind(l, /[S-U]/), l.id + ' 四类形状齐全');
  }
});

test('方框加量（v1.5.0）：方阵风暴/方阵大师章方框为第一大族', () => {
  const count = (l, re) => (l.board.join('').match(re) || []).length;
  for (const ch of [8, 15]) {
    const levels = LEVELS.filter(x => x.chapter === ch);
    const sq = levels.reduce((s, l) => s + count(l, /[S-U]/g), 0);
    const li = levels.reduce((s, l) => s + count(l, /[A-F]/g), 0);
    const tri = levels.reduce((s, l) => s + count(l, /[G-R]/g), 0);
    assert.ok(sq > li && sq > tri, '第 ' + ch + ' 章方框（' + sq + '）应多于直线（' + li + '）与三角（' + tri + '）');
  }
  const totalSq = LEVELS.reduce((s, l) => s + count(l, /[S-U]/g), 0);
  assert.ok(totalSq >= 40, '全战役方框总量 ' + totalSq + ' ≥ 40');
});

test('解锁规则（v1.5.0）：每章第一关直接开放，章内需上一关星数', () => {
  const stars = {};
  for (let i = 0; i < LEVELS.length; i++) {
    const open = unlocked(LEVELS, i, stars);
    const isFirst = i === 0 || LEVELS[i].chapter !== LEVELS[i - 1].chapter;
    if (isFirst) assert.ok(open, LEVELS[i].id + ' 每章第一关开放');
    else assert.ok(!open, LEVELS[i].id + ' 章内需上一关星数');
  }
  assert.ok(unlocked(LEVELS, 1, { '1-1': 1 }), '1-2 在 1-1 有星后开放');
  assert.ok(!unlocked(LEVELS, 2, { '1-1': 1 }), '1-3 不会即时开放');
});

test('非教学关无意外单步解（par > 1 已由复算保证）', () => {
  const teaching = ['1-1', '1-2', '1-3', '2-1', '2-2', '3-1', '4-1'];
  for (const l of LEVELS.filter(x => !teaching.includes(x.id))) {
    assert.ok(l.par >= 2, l.id + ' 非教学关 par ≥ 2');
  }
});
