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
  const browser=await playwright.chromium.launch({headless:true,timeout:10000,...(browserPath?{executablePath:browserPath}:{})});
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
    await page.setViewportSize({width:390,height:844});
    if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))throw new Error('Page overflows the mobile viewport');
    await page.screenshot({path:path.join(outdir,'mobile.png'),fullPage:true,timeout:10000});
    if(errors.length)throw new Error(errors.join('\n'));
    console.log(JSON.stringify({status:'passed',figures:await figures.count(),screenshots:outdir,visual_review:'Inspect screenshots separately; this does not prove scientific fidelity.'}));
  } finally {await browser.close();}
})().catch(error=>{console.error(String(error));process.exitCode=1;});
