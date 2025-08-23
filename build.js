import fs from 'fs';

const files = [
  'src/header.js',
  'src/config.js',
  'src/utils.js',
  'src/dom.js',
  'src/ui.js',
  'src/main.js',
  'src/footer.js'
];

const output = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
fs.writeFileSync('NiceThumbsBuddy.user.js', output);
console.log('Built NiceThumbsBuddy.user.js');
