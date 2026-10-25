/* 十字连爆 · 关卡生成器（固定种子，可复现）
 *
 * 管线：随机棋盘（按章节配方：尺寸/棋子数/点数权重/线形偏置/形状池）
 *   → solver 求最优投点数，必须恰好等于配方 par（IDDFS 保证最浅）
 *   → 播种关（第六、十一章）额外要求：最浅解必含播种步（否则重掷）
 *   → 收录；重试预算耗尽则报错，人工换种子/调参再跑
 *
 * 结构：16 章 × 5 关 = 80 关；特殊形状自第二章（第 6 关）提前登场（v1.5.0）：
 *   直线 6、三角 11、方框 16、播种 26；每章第一关直接开放（unlocked）。
 * 第一章配方与 v1.2.0 完全一致（无 kinds 不耗额外随机数），
 * seed 相同时前 5 关棋盘逐字节复现——玩家进度无损。
 *
 * 用法：node tools/generate-levels.cjs [seed]
 * 输出：levels.js（勿手改）+ 控制台预览
 */
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../engine.js');
const solver = require('../solver.js');

/* ---------------- PRNG（mulberry32，可复现） ---------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- 关卡配方（章节主题 + 文案） ---------------- */
const CH1 = '第一章 · 认识分裂';
const CH2 = '第二章 · 直线初现';
const CH3 = '第三章 · 三角锋芒';
const CH4 = '第四章 · 方阵内爆';
const CH5 = '第五章 · 形状协奏';
const CH6 = '第六章 · 空降播种';
const CH7 = '第七章 · 队形与对齐';
const CH8 = '第八章 · 方阵风暴';
const CH9 = '第九章 · 手紧进阶';
const CH10 = '第十章 · 大盘风暴';
const CH11 = '第十一章 · 播种大师';
const CH12 = '第十二章 · 混沌终局';
const CH13 = '第十三章 · 钢索行走';
const CH14 = '第十四章 · 万形齐发';
const CH15 = '第十五章 · 方阵大师';
const CH16 = '终章 · 万象归一';

const SPECS = [
  // 第一章：认识分裂（6×6，单雷管起步）【原关保留，进度无损】
  { id: '1-1', chapter: 1, title: '第一声', intro: '点击一颗 3 点棋子，给它 +1——看它爆开，把冲击波送进同行同列。', size: 6, bank: 1, par: 1, targetB: 2, weights: [0, 0, 1], fixed: ['......', '......', '..3.3.', '......', '......', '......'] },
  { id: '1-2', chapter: 1, title: '单点引爆', intro: '找那颗只差一点的棋子。', size: 6, bank: 3, par: 1, targetB: 6, weights: [1, 2, 4] },
  { id: '1-3', chapter: 1, title: '更大的排面', intro: '一颗雷，一整片。', size: 6, bank: 3, par: 1, targetB: 9, weights: [1, 2, 4] },
  { id: '1-4', chapter: 1, title: '两步走', intro: '一次不够，就分两次投。', size: 6, bank: 4, par: 2, targetB: 8, weights: [1, 2, 3] },
  { id: '1-5', chapter: 1, title: '小试身手', intro: '让连锁替你干活。', size: 6, bank: 4, par: 2, targetB: 10, weights: [1, 2, 3] },

  // 第二章：直线初现（v1.5.0 提前登场：横线 ▬ / 竖线 ▮ 自第 6 关起）
  { id: '2-1', chapter: 2, title: '第一道横波', intro: '新形状 ▬ 横线：爆开只扫同一横行。', size: 6, bank: 1, par: 1, fixed: ['......', '.C333.', '......', '......', '......', '......'] },
  { id: '2-2', chapter: 2, title: '纵贯线', intro: '新形状 ▮ 竖线：爆开只灌同一纵列。', size: 6, bank: 1, par: 1, fixed: ['...F..', '...3..', '...3..', '...3..', '...3..', '......'] },
  { id: '2-3', chapter: 2, title: '横竖混编', intro: '看清每颗的扫法再投点。', size: 6, bank: 3, par: 2, targetB: 10, weights: [1, 2, 3], kinds: [1, 2], kindShare: 0.4 },
  { id: '2-4', chapter: 2, title: '一线生机', intro: '一条直线，救活全局。', size: 7, bank: 4, par: 3, targetB: 14, weights: [1, 2, 2], kinds: [1, 2], kindShare: 0.45 },
  { id: '2-5', chapter: 2, title: '笔直的愤怒', intro: '章末考核：直线与十字共舞。', size: 7, bank: 5, par: 3, targetB: 16, weights: [1, 2, 2], kinds: [1, 2], kindShare: 0.5, lineBias: 0.5 },

  // 第三章：三角锋芒（▲▼◀▶：整行/列 + 角朝半臂，v1.5.0 提前登场）
  { id: '3-1', chapter: 3, title: 'T 字教头', intro: '新形状 ▲ 三角：爆开扫整行，再加角朝方向的半列——T 字形。', size: 6, bank: 1, par: 1, fixed: ['...3..', '.3.I3.', '......', '......', '......', '......'] },
  { id: '3-2', chapter: 3, title: '朝向的艺术', intro: '三角看朝向：角指哪边，T 就伸向哪边。', size: 6, bank: 4, par: 2, targetB: 10, weights: [1, 2, 3], kinds: [3, 4, 5, 6], kindShare: 0.5 },
  { id: '3-3', chapter: 3, title: '三锋阵', intro: '让几个方向的锋刃同时出鞘。', size: 7, bank: 5, par: 3, targetB: 14, weights: [1, 2, 2], kinds: [3, 4, 5, 6], kindShare: 0.45 },
  { id: '3-4', chapter: 3, title: '锋线交叠', intro: 'T 与十字交叠，波网更密。', size: 7, bank: 5, par: 4, targetB: 16, weights: [1, 2, 2], kinds: [3, 4, 5, 6], kindShare: 0.4, lineBias: 0.4 },
  { id: '3-5', chapter: 3, title: '锋芒毕露', intro: '章末考核：四面三角齐发。', size: 8, bank: 5, par: 4, targetB: 18, weights: [1, 2, 2], kinds: [3, 4, 5, 6], kindShare: 0.5, lineBias: 0.45 },

  // 第四章：方阵内爆（方框 ■：周围一圈 8 邻域）【v1.5.0 提前登场】
  { id: '4-1', chapter: 4, title: '内爆光环', intro: '新形状 ■ 方框：爆开只轰自己周围一圈。', size: 6, bank: 1, par: 1, fixed: ['......', '.333..', '.3U3..', '.333..', '......', '......'] },
  { id: '4-2', chapter: 4, title: '连环马', intro: '一个圈的火种，引燃下一个。', size: 6, bank: 3, par: 2, targetB: 10, weights: [1, 2, 3], kinds: [7], kindShare: 0.4 },
  { id: '4-3', chapter: 4, title: '蜂窝矩阵', intro: '方框相邻成网，一爆传一爆。', size: 7, bank: 5, par: 3, targetB: 14, weights: [1, 2, 2], kinds: [7], kindShare: 0.45 },
  { id: '4-4', chapter: 4, title: '圈内圈外', intro: '够不着的棋子，得另想办法。', size: 7, bank: 5, par: 4, targetB: 16, weights: [1, 2, 2], kinds: [7], kindShare: 0.4 },
  { id: '4-5', chapter: 4, title: '天罗地网', intro: '章末考核：方阵 + 直线 + 十字。', size: 8, bank: 6, par: 4, targetB: 18, weights: [1, 2, 2], kinds: [1, 2, 7], kindShare: 0.45 },

  // 第五章：形状协奏（四类全开）
  { id: '5-1', chapter: 5, title: '万形登场', intro: '所有形状同场：十字、直线、三角、方框。', size: 7, bank: 5, par: 3, targetB: 14, weights: [1, 2, 2], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },
  { id: '5-2', chapter: 5, title: '形状协奏', intro: '让每种形状都发一次力。', size: 8, bank: 5, par: 4, targetB: 16, weights: [1, 2, 2], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },
  { id: '5-3', chapter: 5, title: '四重奏', intro: '四种波及，一张乐谱。', size: 8, bank: 6, par: 4, targetB: 18, weights: [1, 2, 2], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.45 },
  { id: '5-4', chapter: 5, title: '波网交织', intro: '把不同的波拼成一张网。', size: 8, bank: 6, par: 5, targetB: 20, weights: [1, 2, 2], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.45 },
  { id: '5-5', chapter: 5, title: '合奏终章', intro: '章末考核：万形齐鸣。', size: 8, bank: 6, par: 5, targetB: 20, weights: [1, 2, 2], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.5 },

  // 第六章：空降播种（波网交叉点留空，最优解必含播种步）【v1.5.0 位置提前】
  { id: '6-1', chapter: 6, title: '造一颗棋子', intro: '新能力：点空格可以播种一颗 1 点棋子，接住两道冲击波。', size: 7, bank: 5, par: 3, targetB: 8, weights: [1, 2, 2], lineBias: 0.7, requirePlant: true, allowPlant: true, kinds: [1, 2], kindShare: 0.3 },
  { id: '6-2', chapter: 6, title: '搭桥', intro: '交叉点上没有棋子？自己种一颗。', size: 7, bank: 5, par: 3, targetB: 10, weights: [1, 2, 2], lineBias: 0.7, requirePlant: true, allowPlant: true, kinds: [1, 2], kindShare: 0.3 },
  { id: '6-3', chapter: 6, title: '接力棒', intro: '种子吃满两道波就会自己爆。', size: 7, bank: 5, par: 3, targetB: 10, weights: [2, 2, 1], lineBias: 0.7, requirePlant: true, allowPlant: true, kinds: [1, 2, 3, 4], kindShare: 0.3 },
  { id: '6-4', chapter: 6, title: '补位专家', intro: '哪里断链补哪里。', size: 7, bank: 6, par: 4, targetB: 12, weights: [2, 2, 1], lineBias: 0.7, requirePlant: true, allowPlant: true, kinds: [1, 2, 3, 4, 5, 6], kindShare: 0.3 },
  { id: '6-5', chapter: 6, title: '天降奇兵', intro: '章末考核：种对位置，一爆到底。', size: 7, bank: 6, par: 4, targetB: 12, weights: [2, 2, 1], lineBias: 0.75, requirePlant: true, allowPlant: true, kinds: [1, 2, 3, 4, 5, 6], kindShare: 0.35 },

  // 第七章：队形与对齐（直线 + 三角的线形偏置）
  { id: '7-1', chapter: 7, title: '十字路口', intro: '排成十字的棋子，最怕中心起爆。', size: 7, bank: 4, par: 3, targetB: 16, weights: [1, 2, 2], kinds: [1, 2], kindShare: 0.35, lineBias: 0.65 },
  { id: '7-2', chapter: 7, title: '一字长蛇', intro: '整行整列都是燃料。', size: 8, bank: 5, par: 4, targetB: 18, weights: [1, 2, 2], kinds: [1, 2, 3, 4, 5, 6], kindShare: 0.35, lineBias: 0.6 },
  { id: '7-3', chapter: 7, title: '锋线走廊', intro: '让 T 形锋刃顺着走廊走。', size: 8, bank: 5, par: 4, targetB: 20, weights: [1, 2, 2], kinds: [1, 2, 3, 4, 5, 6], kindShare: 0.4, lineBias: 0.6 },
  { id: '7-4', chapter: 7, title: '火力覆盖', intro: '形状波扫过的地方寸草不生。', size: 8, bank: 5, par: 4, targetB: 20, weights: [1, 2, 2], kinds: [1, 2, 3, 4, 5, 6], kindShare: 0.4, lineBias: 0.6 },
  { id: '7-5', chapter: 7, title: '完美队形', intro: '章末考核：为冲击波排好阵列。', size: 8, bank: 6, par: 5, targetB: 22, weights: [1, 2, 2], kinds: [1, 2, 3, 4, 5, 6], kindShare: 0.45, lineBias: 0.65 },

  // 第八章：方阵风暴（v1.5.0 新章：方框加权池——池内重复条目即权重，方框 5/8 ≈ 62%，
  // 家族保底按显示家族只钉直线/方框各一颗，方框稳居第一大族）
  { id: '8-1', chapter: 8, title: '风暴之眼', intro: '方框成海：圈内圈外，全要算到。', size: 7, bank: 4, par: 3, targetB: 14, weights: [1, 2, 2], kinds: [7, 7, 7, 7, 7, 1, 2], kindShare: 0.5 },
  { id: '8-2', chapter: 8, title: '连环矩阵', intro: '方框挨着方框，一爆传一爆。', size: 7, bank: 5, par: 4, targetB: 16, weights: [1, 2, 2], kinds: [7, 7, 7, 7, 7, 1, 2], kindShare: 0.55 },
  { id: '8-3', chapter: 8, title: '直角风暴', intro: '方框与三角，各扫各的圈。', size: 8, bank: 5, par: 4, targetB: 18, weights: [1, 2, 2], kinds: [7, 7, 7, 7, 7, 1, 3], kindShare: 0.5 },
  { id: '8-4', chapter: 8, title: '方寸大乱', intro: '半盘方框的战场。', size: 8, bank: 5, par: 5, targetB: 20, weights: [1, 2, 2], kinds: [7, 7, 7, 7, 7, 1, 2], kindShare: 0.55 },
  { id: '8-5', chapter: 8, title: '八方风雨', intro: '章末考核：方阵为主，万形为辅。', size: 8, bank: 6, par: 5, targetB: 22, weights: [1, 2, 2], kinds: [7, 7, 7, 7, 7, 1, 2, 3], kindShare: 0.55 },

  // 第九章：手紧进阶（bank === par，全形状）
  { id: '9-1', chapter: 9, title: '锱铢必较', intro: '手牌刚好等于最优——全形状下更狠。', size: 7, bank: 3, par: 3, targetB: 12, weights: [2, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.35 },
  { id: '9-2', chapter: 9, title: '度日如年', intro: '每个点都是最后的点。', size: 7, bank: 4, par: 4, targetB: 14, weights: [2, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.35 },
  { id: '9-3', chapter: 9, title: '极限预算', intro: '四点四步，形状是唯一的杠杆。', size: 8, bank: 4, par: 4, targetB: 16, weights: [2, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.35 },
  { id: '9-4', chapter: 9, title: '一子不能错', intro: '顺序与形状都要精确。', size: 8, bank: 5, par: 5, targetB: 18, weights: [2, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },
  { id: '9-5', chapter: 9, title: '走钢丝', intro: '章末考核：零容错全清。', size: 8, bank: 5, par: 5, targetB: 18, weights: [2, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },

  // 第十章：大盘风暴（8×8 全形状大军团）
  { id: '10-1', chapter: 10, title: '大棋盘', intro: '更大的战场，波及全场。', size: 8, bank: 5, par: 4, targetB: 20, weights: [1, 2, 2], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },
  { id: '10-2', chapter: 10, title: '全面战争', intro: '火力全开。', size: 8, bank: 6, par: 5, targetB: 22, weights: [1, 2, 2], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.45 },
  { id: '10-3', chapter: 10, title: '风暴中心', intro: '让连锁在大盘上滚成雪球。', size: 8, bank: 6, par: 5, targetB: 22, weights: [1, 2, 2], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.45 },
  { id: '10-4', chapter: 10, title: '深水区', intro: '棋子越多，越要算清每一步。', size: 8, bank: 6, par: 5, targetB: 24, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },
  { id: '10-5', chapter: 10, title: '风暴之眼', intro: '章末考核：八路盘的最后一波。', size: 8, bank: 6, par: 6, targetB: 24, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.45 },

  // 第十一章：播种大师（大盘播种 + 全形状）
  { id: '11-1', chapter: 11, title: '空降种子', intro: '大盘播种：在波网的空洞里下子。', size: 8, bank: 5, par: 4, targetB: 14, weights: [1, 2, 2], lineBias: 0.7, requirePlant: true, allowPlant: true, kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.35 },
  { id: '11-2', chapter: 11, title: '架桥工', intro: '让种子接住两道以上的波。', size: 8, bank: 5, par: 4, targetB: 16, weights: [1, 2, 2], lineBias: 0.7, requirePlant: true, allowPlant: true, kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.35 },
  { id: '11-3', chapter: 11, title: '点石成金', intro: '一颗 1 点种子，换一整片爆炸。', size: 8, bank: 6, par: 5, targetB: 16, weights: [2, 2, 1], lineBias: 0.7, requirePlant: true, allowPlant: true, kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.35 },
  { id: '11-4', chapter: 11, title: '布局者', intro: '先想好网，再下种子。', size: 8, bank: 6, par: 5, targetB: 18, weights: [2, 2, 1], lineBias: 0.7, requirePlant: true, allowPlant: true, kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },
  { id: '11-5', chapter: 11, title: '妙手回春', intro: '章末考核：播种全清。', size: 8, bank: 6, par: 5, targetB: 18, weights: [2, 2, 1], lineBias: 0.75, requirePlant: true, allowPlant: true, kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },

  // 第十二章：混沌终局（9×9 大盘全形状）
  { id: '12-1', chapter: 12, title: '九路战场', intro: '九路棋盘，万形齐张。', size: 9, bank: 6, par: 5, targetB: 20, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },
  { id: '12-2', chapter: 12, title: '混沌初开', intro: '形状越杂，越要沉住气。', size: 9, bank: 6, par: 5, targetB: 22, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },
  { id: '12-3', chapter: 12, title: '乱中有序', intro: '在混乱里找出那一爆的顺序。', size: 9, bank: 6, par: 5, targetB: 22, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.45 },
  { id: '12-4', chapter: 12, title: '压舱石', intro: '最稳的那颗棋，是全局的支点。', size: 9, bank: 6, par: 6, targetB: 24, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },
  { id: '12-5', chapter: 12, title: '混沌收束', intro: '章末考核：把混乱炸成清空。', size: 9, bank: 6, par: 6, targetB: 24, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.45 },

  // 第十三章：钢索行走（bank === par 的深水零容错）
  { id: '13-1', chapter: 13, title: '钢索', intro: '手牌与最优完全相等——没有退路。', size: 8, bank: 4, par: 4, targetB: 18, weights: [2, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },
  { id: '13-2', chapter: 13, title: '薄冰', intro: '每一步都踩在冰面上。', size: 8, bank: 5, par: 5, targetB: 20, weights: [2, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },
  { id: '13-3', chapter: 13, title: '刀锋', intro: '九路大盘上的零容错。', size: 9, bank: 5, par: 5, targetB: 22, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.35 },
  { id: '13-4', chapter: 13, title: '悬丝', intro: '一步踏空，满盘皆输。', size: 9, bank: 5, par: 5, targetB: 22, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },
  { id: '13-5', chapter: 13, title: '如履薄冰', intro: '章末考核：零容错的九路全清。', size: 9, bank: 6, par: 6, targetB: 24, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.4 },

  // 第十四章：万形齐发（特殊形状密度拉满）
  { id: '14-1', chapter: 14, title: '形海', intro: '特殊形状过半的战场。', size: 9, bank: 6, par: 5, targetB: 22, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.5 },
  { id: '14-2', chapter: 14, title: '形随波转', intro: '形状密度拉满，连锁更野。', size: 9, bank: 6, par: 5, targetB: 24, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.5 },
  { id: '14-3', chapter: 14, title: '百花齐放', intro: '每一族形状都是一支箭。', size: 9, bank: 6, par: 6, targetB: 24, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.5 },
  { id: '14-4', chapter: 14, title: '万形洪流', intro: '波及形状的盛宴。', size: 9, bank: 6, par: 6, targetB: 24, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.55 },
  { id: '14-5', chapter: 14, title: '形之巅峰', intro: '章末考核：半盘皆形，一炸到底。', size: 9, bank: 6, par: 6, targetB: 26, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.55 },

  // 第十五章：方阵大师（v1.5.0 新章：九路大盘方框加权，方框 6/9+ ≈ 67%）
  { id: '15-1', chapter: 15, title: '方阵之王', intro: '九路大盘，方框称王。', size: 9, bank: 6, par: 5, targetB: 22, weights: [1, 2, 1], kinds: [7, 7, 7, 7, 7, 7, 1, 2, 3], kindShare: 0.5 },
  { id: '15-2', chapter: 15, title: '王之领域', intro: '圈内是方框的领土。', size: 9, bank: 6, par: 5, targetB: 24, weights: [1, 2, 1], kinds: [7, 7, 7, 7, 7, 7, 1, 2, 4], kindShare: 0.5 },
  { id: '15-3', chapter: 15, title: '领域扩张', intro: '让每个圈都炸到位。', size: 9, bank: 6, par: 6, targetB: 24, weights: [1, 2, 1], kinds: [7, 7, 7, 7, 7, 7, 1, 2, 5], kindShare: 0.5 },
  { id: '15-4', chapter: 15, title: '方圆之间', intro: '方框与全形状共舞。', size: 9, bank: 6, par: 6, targetB: 26, weights: [1, 2, 1], kinds: [7, 7, 7, 7, 7, 7, 7, 1, 2, 3, 4], kindShare: 0.55 },
  { id: '15-5', chapter: 15, title: '终极方阵', intro: '章末考核：方框的终极考验。', size: 9, bank: 6, par: 6, targetB: 28, weights: [1, 2, 1], kinds: [7, 7, 7, 7, 7, 7, 7, 1, 2, 5, 6], kindShare: 0.55 },

  // 终章：万象归一（八十关的最后一程）
  { id: '16-1', chapter: 16, title: '归一之门', intro: '八十关的最后一程。', size: 9, bank: 6, par: 5, targetB: 24, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.45, lineBias: 0.5 },
  { id: '16-2', chapter: 16, title: '万象归一', intro: '所有形状、所有手法，一关看全。', size: 9, bank: 6, par: 6, targetB: 24, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.45, lineBias: 0.5 },
  { id: '16-3', chapter: 16, title: '最后的杠杆', intro: '手牌压到最低，形状是唯一的杠杆。', size: 9, bank: 6, par: 6, targetB: 26, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.45, lineBias: 0.5 },
  { id: '16-4', chapter: 16, title: '一炸到底', intro: '排好最后一列引信。', size: 9, bank: 6, par: 6, targetB: 26, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.5, lineBias: 0.55 },
  { id: '16-5', chapter: 16, title: '终局·万象归一', intro: '八十关的最后一爆：万形齐发，一炸到底。', size: 9, bank: 6, par: 6, targetB: 28, weights: [1, 2, 1], kinds: [1, 2, 3, 4, 5, 6, 7], kindShare: 0.5, lineBias: 0.55 }
];

const CHAPTERS = { 1: CH1, 2: CH2, 3: CH3, 4: CH4, 5: CH5, 6: CH6, 7: CH7, 8: CH8, 9: CH9, 10: CH10, 11: CH11, 12: CH12, 13: CH13, 14: CH14, 15: CH15, 16: CH16 };

/* ---------------- 随机棋盘 ---------------- */
function pickCount(weights, rnd) {
  const total = weights[0] + weights[1] + weights[2];
  let x = rnd() * total;
  if (x < weights[0]) return 1;
  if (x < weights[0] + weights[1]) return 2;
  return 3;
}

/* 生成一个格子字符：先掷点数，再决定形状——
 * · 钉子格（家族保底）直接用指定家族；
 * · 其余按 kindShare 概率抽池内家族，否则普通十字。
 * 短路写法保证：无 kinds 的旧配方不消耗任何额外随机数
 * （seed 相同时旧 30 关棋盘逐字节复现）。 */
function cellChar(spec, kinds, kindShare, rnd, forcedFam) {
  const p = pickCount(spec.weights, rnd);
  const fam = forcedFam !== undefined
    ? forcedFam
    : (kinds.length && rnd() < kindShare ? kinds[Math.floor(rnd() * kinds.length)] : 0);
  return fam ? engine.CELL_CHARS[fam][p - 1] : String(p);
}

function randomBoard(spec, rnd) {
  const { size, targetB } = spec;
  const cells = new Set();
  const kinds = spec.kinds || [];
  const kindShare = spec.kindShare || 0;
  const lineBias = spec.lineBias || 0;
  const lineCount = Math.round(targetB * lineBias);
  if (lineCount > 0) {
    const lines = [];
    const nLines = Math.min(size, 2 + Math.floor(rnd() * 2));
    for (let k = 0; k < nLines; k++) {
      lines.push({ horizontal: rnd() < 0.5, pos: Math.floor(rnd() * size) });
    }
    for (let k = 0; k < lineCount; k++) {
      const line = lines[Math.floor(rnd() * lines.length)];
      const t = Math.floor(rnd() * size);
      cells.add(line.horizontal ? line.pos * size + t : t * size + line.pos);
    }
  }
  while (cells.size < targetB) {
    cells.add(Math.floor(rnd() * size * size));
  }
  const rows = [];
  // 家族保底（混形关）：池内每个显示家族（直线=1/2、三角=3-6、方框=7）先随机钉一颗
  // （不放回），钉哪颗 kind 从池内该族成员中随机；其余按 kindShare 随机。
  // 必须按“显示家族”而非 kind 编号去重：直线占 2 个编号、三角占 4 个、方框只有 1 个，
  // 按 kind 钉子会给直线/三角多钉，稀释方框章的加权池配方。
  let forced = null;
  if (kinds.length) {
    const FAM_OF = { 1: 'line', 2: 'line', 3: 'tri', 4: 'tri', 5: 'tri', 6: 'tri', 7: 'sq' };
    const byFam = new Map();
    for (const k of kinds) {
      const f = FAM_OF[k];
      if (!byFam.has(f)) byFam.set(f, []);
      if (!byFam.get(f).includes(k)) byFam.get(f).push(k);
    }
    const spots = [...cells];
    forced = new Map();
    for (const [, members] of byFam) {
      const t = Math.floor(rnd() * spots.length);
      forced.set(spots[t], members[Math.floor(rnd() * members.length)]);
      spots.splice(t, 1);
    }
  }
  for (let r = 0; r < size; r++) {
    let row = '';
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      row += cells.has(idx) ? cellChar(spec, kinds, kindShare, rnd, forced ? forced.get(idx) : undefined) : '.';
    }
    rows.push(row);
  }
  return rows;
}

/* ---------------- 验证一个候选棋盘 ---------------- */
function evaluate(spec, board) {
  const game = engine.newGame({
    size: spec.size, board, bank: spec.bank, allowPlant: !!spec.allowPlant
  });
  const t0 = Date.now();
  const res = solver.solve(game, { timeBudget: 3000 });
  const ms = Date.now() - t0;
  if (!res || res.timeout) return null;
  if (res.depth !== spec.par) return null;
  if (spec.requirePlant) {
    // 播种章：最浅解必须包含播种步（投在初始空格上），
    // 保证“播种”确实在该关最优路径中，而不是可有可无的摆设。
    const flat = board.join('');
    const plantMoves = res.moves.filter(i => flat[i] === '.');
    if (plantMoves.length === 0) return null;
  }
  return { moves: res.moves, depth: res.depth, ms };
}

/* ---------------- 主流程 ---------------- */
function main() {
  const seed = Number(process.argv[2] || 20261023);
  const rnd = mulberry32(seed);
  const out = [];
  console.log('chess-crash 关卡生成 · seed = ' + seed + '\n');
  for (const spec of SPECS) {
    let picked = null;
    let attempts = 0;
    if (spec.fixed) {
      const ev = evaluate(spec, spec.fixed);
      if (!ev) {
        console.error('固定关卡 ' + spec.id + ' 验证失败！');
        process.exit(1);
      }
      picked = { board: spec.fixed, ev, attempts: 0 };
    } else {
      const budget = 6000;
      while (attempts < budget && !picked) {
        attempts++;
        const board = randomBoard(spec, rnd);
        const ev = evaluate(spec, board);
        if (ev) picked = { board, ev, attempts };
      }
    }
    if (!picked) {
      console.error(spec.id + ' 生成失败：' + spec.par + ' 步关卡在 ' + 6000 + ' 次尝试内未命中，请调整种子或配方');
      process.exit(1);
    }
    out.push({
      id: spec.id,
      chapter: spec.chapter,
      title: spec.title,
      intro: spec.intro,
      size: spec.size,
      bank: spec.bank,
      par: picked.ev.depth,
      allowPlant: !!spec.allowPlant,
      board: picked.board
    });
    console.log(`${spec.id} ${spec.title} — par=${picked.ev.depth} bank=${spec.bank} 尝试 ${picked.attempts} 次 · 求解 ${picked.ev.ms}ms`);
    for (const row of picked.board) console.log('    ' + row);
    console.log('');
  }

  const banner = `/* 十字连爆 · 关卡数据
 * 由 tools/generate-levels.cjs 生成（seed=${seed}）并经 solver 逐关验证：
 * 最优投点数 === par；播种关（第六、十一章）的最浅解必含播种步；
 * 特殊形状自第二章（第 6 关）登场（棋盘字符 A-U）；每章第一关直接开放。
 * 请勿手改，重跑生成器即可再生成。
 */
`;
  const body = out.map(l => '  ' + JSON.stringify(l).replace(/","/g, '",\n    "').replace(/"board":\[/, '"board": [\n    ').replace(/\]/, '\n  ]')).join(',\n');
  const file = `${banner}(function (root) {
  'use strict';
  const LEVELS = [
${body}
  ];
  const CHAPTERS = ${JSON.stringify(CHAPTERS)};
  function starFor(level, placed) {
    return placed <= level.par ? 3 : placed <= level.par + 1 ? 2 : 1;
  }
  function unlocked(levels, index, stars) {
    if (index <= 0) return true;
    if (levels[index].chapter !== levels[index - 1].chapter) return true; /* 每章第一关直接开放 */
    return !!stars[levels[index - 1].id];
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LEVELS, CHAPTERS, starFor, unlocked };
  } else {
    root.CC_LEVELS = LEVELS;
    root.CC_CHAPTERS = CHAPTERS;
    root.CC_STAR_FOR = starFor;
    root.CC_UNLOCKED = unlocked;
  }
})(typeof self !== 'undefined' ? self : globalThis);
`;
  const dest = path.join(__dirname, '..', 'levels.js');
  fs.writeFileSync(dest, file, 'utf8');
  console.log('已写入 ' + dest + '（共 ' + out.length + ' 关）');
}

main();
