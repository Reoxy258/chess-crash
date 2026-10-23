/* 离线单文件构建：把 style/engine/solver/levels/challenge/app 内联进一个 HTML，
 * 在项目父目录生成 chess-crash.html（双击即玩，无需网络）。 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let html = read('index.html');
// 内联脚本从 head 挪到 </body> 前：原版依赖 defer（DOM 就绪后执行），
// 内联 script 的 defer 会被忽略，同步执行时 body 尚未解析。
const scripts = [];
const inline = (tag, file) => {
  let code = read(file).replace(/<\/script>/gi, '<\\/script>');
  html = html.replace(tag, '');
  scripts.push('<script>\n' + code + '\n</script>');
};

html = html.replace(
  /<link rel="stylesheet" href="style\.css\?[^"]*">/,
  () => '<style>\n' + read('style.css') + '\n</style>'
);
inline(/<script src="engine\.js\?[^"]*" defer><\/script>/, 'engine.js');
inline(/<script src="solver\.js\?[^"]*" defer><\/script>/, 'solver.js');
inline(/<script src="levels\.js\?[^"]*" defer><\/script>/, 'levels.js');
inline(/<script src="challenge\.js\?[^"]*" defer><\/script>/, 'challenge.js');
inline(/<script src="app\.js\?[^"]*" defer><\/script>/, 'app.js');
html = html.replace('</body>', scripts.join('\n') + '\n</body>');

const dest = path.join(ROOT, '..', 'chess-crash.html');
fs.writeFileSync(dest, html, 'utf8');
console.log('离线构建完成: ' + dest + ' (' + (html.length / 1024).toFixed(1) + ' KB)');
