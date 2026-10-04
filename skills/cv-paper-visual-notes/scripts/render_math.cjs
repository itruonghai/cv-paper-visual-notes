// Typeset with the pinned local renderer. Never fetch code, CSS, fonts, or TeX.
const fs = require('node:fs');
const katex = require('../assets/vendor/katex/katex.min.js');
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const rendered = input.expressions.map(({tex, display}) => {
    try {
      return {html: katex.renderToString(tex, {
        displayMode: display, output: 'htmlAndMathml', throwOnError: true,
        strict: 'error', trust: context => { throw Error('Unsupported HTML/link command in math: ' + context.command); }, maxExpand: 1000, maxSize: 20,
        macros: {...input.macros}
      })};
    } catch (error) { return {error: error.message}; }
  });
  process.stdout.write(JSON.stringify({version: katex.version, rendered}));
} catch (error) { console.error(error.message); process.exitCode = 1; }
