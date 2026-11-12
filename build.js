const fs = require('node:fs');
const path = require('node:path');
const base = __dirname, read = file => fs.readFileSync(path.join(base, 'src', file), 'utf8');
fs.mkdirSync(path.join(base, 'dist'), { recursive: true });
fs.mkdirSync(path.join(base, 'apps-script'), { recursive: true });
function html(mode) {
  return read('index.html').replace('/* STYLES */', () => read('styles.css'))
    .replace('/* RUNTIME */', () => `window.RUNTIME_MODE = '${mode}';`)
    .replace('/* CORE */', () => read('core.js'))
    .replace('/* BANK */', () => mode === 'local' ? read('demo-bank.js') : 'window.DEMO_BANK = [];')
    .replace('/* APP */', () => read('app.js'));
}
fs.writeFileSync(path.join(base, 'dist', 'index.html'), html('local'));
fs.writeFileSync(path.join(base, 'apps-script', 'Index.html'), html('gas'));
fs.writeFileSync(path.join(base, 'apps-script', 'Code.gs'), read('Code.gs'));
fs.writeFileSync(path.join(base, 'apps-script', 'Core.gs'), read('core.js'));
fs.writeFileSync(path.join(base, 'apps-script', 'DemoBank.gs'), read('demo-bank.js'));
fs.writeFileSync(path.join(base, 'apps-script', 'appsscript.json'), JSON.stringify({ timeZone: 'Asia/Tokyo', exceptionLogging: 'STACKDRIVER', runtimeVersion: 'V8' }, null, 2));
fs.writeFileSync(path.join(base, 'demo-stimuli.json'), JSON.stringify(require('./src/demo-bank'), null, 2));
console.log('Built dist/index.html and Apps Script source files.');
