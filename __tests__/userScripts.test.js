const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('user script syntax', () => {
  const dir = path.resolve(__dirname, '..');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.user.js'));

  test.each(files)('%s parses without syntax errors', (file) => {
    const code = fs.readFileSync(path.join(dir, file), 'utf8');
    expect(() => new vm.Script(code)).not.toThrow();
  });
});
