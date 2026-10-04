// Check the create_math_fixture.py notebook in an isolated, offline browser.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const [notebook, out, playwrightPath, browserPath] = process.argv.slice(2);
const playwright = require(playwrightPath);
const timer = setTimeout(() => { console.error('Math check timed out'); process.exit(2); }, 45000);
let browser;
(async () => {
  fs.mkdirSync(out, {recursive: true});
  browser = await playwright.chromium.launch({headless: true, chromiumSandbox: true, executablePath: browserPath, timeout: 10000});
  const context = await browser.newContext({viewport: {width: 1500, height: 1100}, offline: true, acceptDownloads: true});
  const page = await context.newPage(), errors = [], remoteRequests = [];
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) remoteRequests.push(request.url()); });
  await page.goto(pathToFileURL(notebook).href);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({content: 'html{scroll-behavior:auto!important}'});
  const count = await page.locator('[data-annotatable] .paper-math').count();
  assert.ok(count >= 15, 'All fixture equations must be typeset');
  assert.equal(await page.locator('.katex-error').count(), 0);
  assert.equal(await page.locator('script[src],link[rel="stylesheet"]').count(), 0);
  assert.ok(await page.evaluate(() => document.fonts.check('17px KaTeX_Main')));
  assert.ok(await page.locator('.paper-math .katex-mathml math').count() >= count);
  // A relation at the end of a line must move as a unit, not leave "s =" on
  // one line and "2" on the next (found in the StreamMAE notebook).
  assert.equal(await page.locator('#inline-wrap-probe .katex').evaluate(el => el.getClientRects().length), 1);
  assert.ok(await page.locator('.comparison-table').evaluate(el => el.getBoundingClientRect().width <= el.parentElement.clientWidth + 1), 'Both comparison columns must fit a laptop viewport');
  await page.locator('#math-details').evaluate(el => { el.open = true; });
  await page.screenshot({path: path.join(out, 'math-desktop.png'), fullPage: true});
  const desktopWidths = await page.locator('.paper-math-inline .katex').evaluateAll(els => els.map(el => el.getBoundingClientRect().width));
  assert.ok(desktopWidths.every(width => width > 0));
  // Capturing a paragraph must omit the hidden MathML/TeX copy. The visible
  // output is fixed at build time, so restoring a highlight needs no math delay.
  await page.locator('#inline-math-passage').evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
  });
  await page.locator('#capture-selection [data-action="comment"]').click();
  await page.locator('#capture-comment').fill('Check this normalization.');
  await page.locator('#capture-form button[type="submit"]').click();
  const wait = page.waitForEvent('download'); await page.locator('#export-annotations').click();
  const file = path.join(out, 'math-captures.json'); await (await wait).saveAs(file);
  const capture = JSON.parse(fs.readFileSync(file, 'utf8')).annotations[0];
  assert.ok(!capture.target.exact.includes('\\mathsf') && !capture.target.exact.includes('\\sqrt'));
  assert.equal(capture.target.exact.split('A query').length - 1, 1);
  await page.reload(); await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.locator('.capture-card').count(), 1);
  assert.equal(await page.locator('.capture-card.needs-review').count(), 0);
  assert.ok(await page.evaluate(() => CSS.highlights.get('cv-captures').size > 0));
  await page.setViewportSize({width: 390, height: 844});
  assert.equal(await page.locator('#inline-wrap-probe .katex').evaluate(el => el.getClientRects().length), 1);
  await page.locator('#math-details').evaluate(el => { el.open = true; });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'}));
  await page.screenshot({path: path.join(out, 'math-mobile.png'), fullPage: true});
  await page.setViewportSize({width: 794, height: 1123});
  await page.emulateMedia({media: 'print'});
  assert.ok(await page.locator('.comparison-table').evaluate(el => el.getBoundingClientRect().width <= el.parentElement.clientWidth + 1), 'Printed comparison must fit the page');
  const tooWide = await page.locator('.paper-math-display').evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.dataset.latex));
  assert.deepEqual(tooWide, [], 'Print equations must not depend on horizontal scrolling');
  await page.pdf({path: path.join(out, 'math-print.pdf'), format: 'A4', printBackground: true});
  assert.deepEqual(remoteRequests, [], 'Offline notebook must not fetch math resources');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({status: 'passed', equations: count, offline: true, captureReload: true, mobileOverflow: false, print: 'math-print.pdf'}));
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => { clearTimeout(timer); if (browser) await browser.close(); });
