// Called by verify_notebook.py with a hard outer timeout and temporary browser profile.
const fs=require('fs');
const path=require('path');
const {pathToFileURL}=require('url');
const {createRequire}=require('module');
const [notebook,outdir,playwrightPath,browserPath]=process.argv.slice(2);
(async()=>{
  let playwright;
  try {
    playwright=playwrightPath ? require(playwrightPath) : createRequire(path.join(process.cwd(),'package.json'))('playwright');
  } catch(_){throw new Error('Playwright is unavailable in this Node runtime. Supply --playwright /absolute/path/to/node_modules/playwright.');}
  fs.mkdirSync(outdir,{recursive:true});
  const browser=await playwright.chromium.launch({headless:true,chromiumSandbox:true,timeout:10000,...(browserPath?{executablePath:browserPath}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1300,height:900},acceptDownloads:true});
    page.setDefaultTimeout(8000);
    const errors=[];page.on('pageerror',error=>errors.push(String(error)));
    await page.goto(pathToFileURL(notebook).href,{timeout:10000,waitUntil:'load'});
    const figures=page.locator('figure img');
    for(let i=0;i<await figures.count();i++){
      await figures.nth(i).evaluate(async img=>{await img.decode();if(!img.naturalWidth)throw new Error('Unreadable figure');});
    }
    await page.screenshot({path:path.join(outdir,'desktop.png'),fullPage:true,timeout:10000});
    if(await figures.count()){
      await figures.first().click();
      if(!await page.locator('#figure-dialog').isVisible())throw new Error('Figure enlargement failed');
      await page.locator('#close-figure').click();
    }
    const editor=page.locator('#notes-editor');
    const initial=await editor.inputValue();
    await editor.fill(initial+'\nTemporary verification draft.');
    const downloaded=page.waitForEvent('download');
    await page.locator('#export-notes').click();
    const download=await downloaded;
    await download.saveAs(path.join(outdir,'verification-notes.md'));
    if(!fs.readFileSync(path.join(outdir,'verification-notes.md'),'utf8').endsWith('Temporary verification draft.'))throw new Error('Note export changed text');
    page.on('dialog',dialog=>dialog.accept());
    await page.locator('#import-notes').setInputFiles({name:'notes.md',mimeType:'text/markdown',buffer:Buffer.from('Imported verification notes.\nLast line.')});
    await page.waitForFunction(()=>document.getElementById('notes-editor').value.endsWith('Last line.'));
    await page.reload();
    if(!await editor.inputValue().then(value=>value.endsWith('Last line.')))throw new Error('Note draft did not survive reload');
    const commentFigure=page.locator('.figure-comment');
    if(await commentFigure.count()){
      const before=await page.locator('.capture-card').count();
      await commentFigure.first().click();
      await page.locator('#capture-comment').fill('Temporary verification question.');
      await page.locator('#capture-tag input[value="question"]').check();
      await page.locator('#capture-form button[type="submit"]').click();
      if(await page.locator('.capture-card').count()!==before+1)throw new Error('Figure capture failed');
      const exported=page.waitForEvent('download');await page.locator('#export-annotations').click();
      await (await exported).saveAs(path.join(outdir,'verification-annotations.json'));
      await page.locator('#import-annotations').setInputFiles(path.join(outdir,'verification-annotations.json'));
      await page.waitForFunction(()=>!document.getElementById('import-annotations').value);
      if(await page.locator('.capture-card').count()!==before+1)throw new Error('Duplicate import created captures');
      await page.reload();
      if(await page.locator('.capture-card').count()!==before+1)throw new Error('Captures did not survive reload');
    }
    const passage=page.locator('[data-annotatable] p').filter({hasText:/\S/});
    if(await passage.count()){
      const before=await page.locator('.capture-card').count();
      await passage.first().evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(range);el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
      await page.locator('#capture-selection [data-action="comment"]').click();
      await page.locator('#capture-comment').fill('Temporary verification highlight.');
      await page.locator('#capture-form button[type="submit"]').click();
      if(await page.locator('.capture-card').count()!==before+1)throw new Error('Text capture failed');
      await page.reload();
      if(await page.locator('.capture-card').count()!==before+1)throw new Error('Text capture did not survive reload');
      if(await page.locator('.capture-card.needs-review').count())throw new Error('A fresh capture needs reattachment after reload');
      if(!await page.evaluate(()=>!globalThis.Highlight||CSS.highlights.get('cv-captures')?.size>0))throw new Error('Text capture is not highlighted');
    }
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Fixture clipboard denial');}}}));
    await page.locator('#copy-question').click();
    if(!await page.locator('#discussion-prompt-panel').evaluate(el=>el.open))throw new Error('Clipboard fallback is not visible');
    const disclosures=await page.locator('[data-annotatable] details').evaluateAll(els=>els.map(el=>el.open));
    await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
    if(!await page.locator('[data-annotatable] details').evaluateAll(els=>els.every(el=>el.open)))throw new Error('Print omitted closed details');
    if(await page.locator('#print-notes').textContent()!==await editor.inputValue())throw new Error('Print omitted current notes');
    await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
    if(JSON.stringify(disclosures)!==JSON.stringify(await page.locator('[data-annotatable] details').evaluateAll(els=>els.map(el=>el.open))))throw new Error('Print changed disclosure states');
    await page.setViewportSize({width:390,height:844});
    if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))throw new Error('Page overflows the mobile viewport');
    await page.screenshot({path:path.join(outdir,'mobile.png'),fullPage:true,timeout:10000});
    if(errors.length)throw new Error(errors.join('\n'));
    console.log(JSON.stringify({status:'passed',figures:await figures.count(),screenshots:outdir,visual_review:'Inspect screenshots separately; this does not prove scientific fidelity.'}));
  } finally {await browser.close();}
})().catch(error=>{console.error(String(error));process.exitCode=1;});
