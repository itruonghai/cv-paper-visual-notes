/* Run against create_browser_fixture.py output, never a user's paper folder. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {spawnSync}=require('node:child_process');
const [root,out,playwrightPath,browserPath]=process.argv.slice(2);
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'fixture.json'),'utf8')).synthetic,true);
const playwright=require(playwrightPath),errors=[],passed=[];
const ui=JSON.parse(fs.readFileSync(path.join(__dirname,'../skills/cv-paper-visual-notes/assets/ui-strings.json'),'utf8'));
const timer=setTimeout(()=>{console.error('Browser regression timed out');process.exit(2);},90000);
let browser;
async function open(variant='base',context){
  context ||= await browser.newContext({viewport:{width:1500,height:1000},acceptDownloads:true});
  const page=await context.newPage();page.setDefaultTimeout(4000);
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.goto(pathToFileURL(path.join(root,variant,'notebook.html')).href);
  await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  return page;
}
const failed=[];
async function test(name,fn){
  // Keep running later scenarios so one regression does not hide another.
  try {await fn();passed.push(name);console.log('PASS '+name);}
  catch(error){failed.push(name);console.error('FAIL '+name+'\n  '+String(error.stack||error).split('\n').slice(0,3).join('\n  '));}
  finally {for(const context of browser.contexts())await context.close().catch(()=>{});}
}
async function capture(page,selector='#opening',comment='Why does this design help?'){
  await page.locator(selector).evaluate(element=>{
    const text=document.createTreeWalker(element,NodeFilter.SHOW_TEXT).nextNode();
    const range=document.createRange();range.setStart(text,0);range.setEnd(text,Math.min(text.length,'This exact sentence explains the design intention.'.length));
    getSelection().removeAllRanges();getSelection().addRange(range);element.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  });
  await page.locator('#capture-selection [data-action="comment"]').click();await page.locator('#capture-comment').fill(comment);
  await page.locator('#capture-tag input[value="question"]').check();await page.locator('#capture-form button[type="submit"]').click();
}
async function exported(page,name='#export-annotations',filename='export.json'){
  const waiting=page.waitForEvent('download');await page.locator(name).click();
  const file=path.join(out,filename);await(await waiting).saveAs(file);return fs.readFileSync(file,'utf8');
}
async function importDoc(page,doc){
  await page.locator('#import-annotations').setInputFiles({name:'annotations.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
  await page.waitForFunction(()=>!document.getElementById('import-annotations').value);
}
// Screen point at the middle of a word inside an element's first text node.
async function wordPoint(page,selector,word){
  return page.locator(selector).evaluate((element,word)=>{
    const text=document.createTreeWalker(element,NodeFilter.SHOW_TEXT).nextNode(),at=text.data.indexOf(word);
    const range=document.createRange();range.setStart(text,at);range.setEnd(text,at+word.length);
    const box=range.getBoundingClientRect();return {x:box.left+box.width/2,y:box.top+box.height/2};
  },word);
}
async function selectWords(page,selector,words){
  await page.locator(selector).evaluate((element,words)=>{
    const text=document.createTreeWalker(element,NodeFilter.SHOW_TEXT).nextNode(),at=text.data.indexOf(words);
    const range=document.createRange();range.setStart(text,at);range.setEnd(text,at+words.length);
    getSelection().removeAllRanges();getSelection().addRange(range);
  },words);
}
async function rightClick(page,point){await page.mouse.click(point.x,point.y,{button:'right'});}
const menuItem=(page,label)=>page.locator('#capture-menu').getByRole('menuitem',{name:label,exact:true});
const highlightCount=(page,name)=>page.evaluate(name=>CSS.highlights.get(name)?.size||0,name);
async function mockFolder(page){
  await page.evaluate(()=>{
    const seed=JSON.parse(document.getElementById('notebook-seed').textContent);
    window.disk={'paper.json':JSON.stringify({paper_id:seed.paperId,version:seed.version}),'notes.md':seed.notes,'annotations.json':seed.annotationFile};
    window.writes=[];window.permission='granted';window.failName=null;
    const directory=prefix=>({
      requestPermission:async()=>window.permission,
      getDirectoryHandle:async name=>directory(prefix+name+'/'),
      getFileHandle:async(name,options={})=>{
        const key=prefix+name;
        if(!(key in window.disk)&&!options.create)throw new DOMException('Absent','NotFoundError');
        return {getFile:async()=>({text:async()=>window.disk[key]}),createWritable:async()=>{
          if(key===window.failName)throw new DOMException('Denied by fixture','NotAllowedError');
          let content;return {write:async text=>{content=text;},close:async()=>{window.disk[key]=content;window.writes.push(key);},abort:async()=>{}};
        }};
      }
    });
    window.showDirectoryPicker=async()=>{if(window.cancelPicker)throw new DOMException('Cancelled','AbortError');return directory('');};
  });
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  browser=await playwright.chromium.launch({headless:true,chromiumSandbox:true,timeout:10000,executablePath:browserPath});
  let portable;
  await test('Select text, retain exact words/origin, highlight, reload, duplicate import, digest',async()=>{
    const page=await open();await capture(page);
    assert.equal(await page.locator('.capture-card').count(),1);
    portable=JSON.parse(await exported(page));const a=portable.annotations[0];
    assert.equal(a.target.exact,'This exact sentence explains the design intention.');assert.equal(a.source.kind,'notebook-prose');
    assert.equal(a.comment,'Why does this design help?');assert.ok(await page.evaluate(()=>CSS.highlights.get('cv-captures').size===1));
    await page.reload();assert.equal(await page.locator('.capture-card').count(),1);
    await importDoc(page,portable);assert.equal(await page.locator('.capture-card').count(),1);
    const digest=await exported(page,'#export-digest','digest.md');assert.ok(digest.includes(a.id)&&digest.includes(a.comment));
    await capture(page,'[data-origin="paper-passage"]','Literal <img src=x onerror=alert(1)> comment');
    const second=JSON.parse(await exported(page));assert.equal(second.annotations[1].source.kind,'paper-passage');
    assert.equal(await page.locator('.capture-card img').count(),0);
    await page.screenshot({path:path.join(out,'captures-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:path.join(out,'captures-mobile.png'),fullPage:true});
    await page.locator('#reader-captures').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,'capture-panel-mobile.png')});
    await page.context().close();
  });
  await test('Whole-figure capture and deleted-target recovery',async()=>{
    const page=await open();await page.locator('.figure-comment').click();await page.locator('#capture-comment').fill('Which arrow is learned?');await page.locator('#capture-form button[type="submit"]').click();
    const doc=JSON.parse(await exported(page));assert.equal(doc.annotations[0].kind,'figure');
    const changed=await open('rewritten');await importDoc(changed,doc);assert.equal(await changed.locator('.needs-review').count(),1);
    assert.equal(JSON.parse(await exported(changed)).annotations[0].comment,'Which arrow is learned?');
    await page.context().close();await changed.context().close();
  });
  await test('Moved notebook import reattaches; rewritten passage remains orphaned',async()=>{
    const page=await open('moved');await importDoc(page,portable);assert.equal(await page.locator('.needs-review').count(),0);
    const changed=await open('rewritten');await importDoc(changed,portable);assert.equal(await changed.locator('.needs-review').count(),1);
    await page.context().close();await changed.context().close();
  });
  await test('Future/wrong schemas and conflicting imports preserve current captures',async()=>{
    const page=await open();await importDoc(page,portable);
    for(const data of [{...portable,schema_version:99},{...portable,paper_id:'wrong'}]){
      await importDoc(page,data);assert.equal(await page.locator('.capture-card').count(),1);
      assert.match(await page.locator('#annotation-status').textContent(),/Import failed/);
    }
    const other=JSON.parse(JSON.stringify(portable));other.annotations[0].comment='Conflicting comment';
    await importDoc(page,other);assert.equal(await page.locator('.capture-card').count(),2);
    await importDoc(page,other);assert.equal(await page.locator('.capture-card').count(),2);
    assert.ok(JSON.parse(await exported(page)).annotations.some(a=>a.comment===portable.annotations[0].comment));
    await page.context().close();
  });
  await test('Linked replies display without resolving reader questions',async()=>{
    const page=await open('reply');assert.equal(await page.locator('.capture-card details').count(),1);
    assert.match(await page.locator('.capture-card details').textContent(),/Evidence-backed answer/);
    assert.equal(JSON.parse(await exported(page)).annotations[0].status,'open');
    await page.context().close();
  });
  await test('Saving then reopening an older HTML snapshot preserves an edited capture',async()=>{
    const page=await open('reply');await mockFolder(page);await page.locator('#connect-folder').click();
    await page.locator('.capture-card').getByRole('button',{name:'Edit',exact:true}).click();
    await page.locator('#capture-comment').fill('New wording after a folder save.');await page.locator('#capture-form button[type="submit"]').click();
    await page.locator('#save-folder').click();await page.waitForFunction(()=>document.getElementById('folder-status').textContent.startsWith('Saved notes.md'));
    await page.reload();const data=JSON.parse(await exported(page));
    assert.equal(data.annotations.length,1);assert.equal(data.annotations[0].comment,'New wording after a folder save.');
    await page.context().close();
  });
  await test('Folder save creates recovery copy; outside edits prevent overwrite',async()=>{
    const page=await open();await mockFolder(page);await page.locator('#connect-folder').click();
    await page.locator('#notes-editor').fill('Reader file edit.');await capture(page);await page.locator('#save-folder').click();
    await page.waitForFunction(()=>document.getElementById('folder-status').textContent.startsWith('Saved notes.md'));
    assert.equal(await page.evaluate(()=>disk['notes.md']),'Reader file edit.');
    assert.equal(await page.evaluate(()=>JSON.parse(disk['annotations.json']).annotations.length),1);
    assert.ok(await page.evaluate(()=>writes.some(name=>name.startsWith('.reading-backups/'))));
    await page.evaluate(()=>{disk['notes.md']='Agent changed this on disk.';writes=[];});
    await page.locator('#notes-editor').fill('New browser thought.');await page.locator('#save-folder').click();
    await page.waitForFunction(()=>!document.getElementById('disk-conflict').classList.contains('hidden'));
    assert.equal(await page.evaluate(()=>disk['notes.md']),'Agent changed this on disk.');assert.equal(await page.evaluate(()=>writes.length),0);
    await page.locator('#load-disk').click();assert.equal(await page.locator('#notes-editor').inputValue(),'Agent changed this on disk.');
    assert.match(await page.locator('#previous-text').textContent(),/New browser thought/);
    await page.context().close();
  });
  await test('Cancellation, wrong folder, revoked access, partial save, and download fallback',async()=>{
    const page=await open();await mockFolder(page);
    await page.evaluate(()=>window.cancelPicker=true);await page.locator('#connect-folder').click();
    await page.waitForFunction(()=>document.getElementById('folder-status').textContent.includes('cancelled'));
    await page.evaluate(()=>{cancelPicker=false;disk['paper.json']=JSON.stringify({paper_id:'wrong',version:'v1'});});
    await page.locator('#connect-folder').click();await page.waitForFunction(()=>document.getElementById('folder-status').textContent.includes('matches'));
    assert.equal(await page.locator('#save-folder').isDisabled(),true);
    await mockFolder(page);await page.locator('#connect-folder').click();await page.locator('#notes-editor').fill('Draft survives failed save.');
    await page.evaluate(()=>window.permission='denied');await page.locator('#save-folder').click();await page.waitForFunction(()=>document.getElementById('folder-status').textContent.includes('not granted'));
    assert.equal(await page.evaluate(()=>writes.length),0);
    await page.evaluate(()=>{permission='granted';failName='annotations.json';});await page.locator('#save-folder').click();
    await page.waitForFunction(()=>document.getElementById('folder-status').textContent.includes('incomplete'));
    assert.match(await page.locator('#folder-status').textContent(),/notes.md/);
    assert.equal(await page.evaluate(()=>disk['notes.md']),'Draft survives failed save.');
    assert.match(await exported(page,'#export-notes','fallback.md'),/Draft survives failed save/);
    await page.context().close();
  });
  await test('Two-tab captures merge and conflicting notes remain recoverable',async()=>{
    const page=await open(),other=await open('base',page.context());
    await capture(page,'#opening','First tab comment.');
    await other.waitForFunction(()=>document.querySelectorAll('.capture-card').length===1);
    await capture(other,'#opening','Second tab comment.');
    await page.waitForFunction(()=>document.querySelectorAll('.capture-card').length===2);
    const doc=JSON.parse(await exported(page));assert.equal(doc.annotations.length,2);
    await page.locator('#notes-editor').fill('First tab notes.');
    await other.waitForFunction(()=>document.getElementById('previous-text').textContent==='First tab notes.');
    assert.notEqual(await other.locator('#notes-editor').inputValue(),'First tab notes.');
    await other.locator('#notes-editor').fill('Second tab notes.');
    await page.waitForFunction(()=>document.getElementById('previous-text').textContent==='Second tab notes.');
    await page.context().close();
  });
  await test('File snapshot conflict choices retain prior editor text',async()=>{
    const page=await open();await page.evaluate(()=>{
      const seed=JSON.parse(document.getElementById('notebook-seed').textContent);
      localStorage.setItem('cv-paper-notes:'+JSON.stringify([seed.paperId,seed.version]),JSON.stringify({text:'Older browser draft.',baseHash:'old-build'}));
    });await page.reload();assert.equal(await page.locator('#conflict').isVisible(),true);
    await page.locator('#use-file').click();assert.match(await page.locator('#notes-editor').inputValue(),/Original reader words/);
    assert.equal(await page.locator('#previous-text').textContent(),'Older browser draft.');
    await page.context().close();
  });
  await test('Print includes closed technical details and all notes, excludes recovery, restores details',async()=>{
    const page=await open();await page.locator('#notes-editor').fill(Array.from({length:100},(_,i)=>'Note line '+(i+1)).join('\n')+'\nPRINT_NOTES_END_MARKER');
    await page.evaluate(()=>{
      document.getElementById('previous-panel').classList.remove('hidden');document.getElementById('previous-panel').open=true;
      document.getElementById('previous-text').textContent='RECOVERY_MUST_NOT_PRINT';
    });
    assert.equal(await page.locator('#technical').evaluate(el=>el.open),false);
    await page.pdf({path:path.join(out,'print-regression.pdf'),format:'A4',printBackground:true});
    assert.equal(await page.locator('#technical').evaluate(el=>el.open),false);
    const printed=spawnSync('pdftotext',[path.join(out,'print-regression.pdf'),'-'],{encoding:'utf8'});
    if(printed.error?.code==='ENOENT')console.log('SKIP PDF text check: pdftotext unavailable; inspect print-regression.pdf.');
    else {
      assert.equal(printed.status,0,printed.stderr);
      for(const marker of ['PRINT_TECHNICAL_END_MARKER','PRINT_NOTES_END_MARKER','Note line 100'])assert.ok(printed.stdout.includes(marker),marker);
      assert.ok(!printed.stdout.includes('RECOVERY_MUST_NOT_PRINT'));
    }
    await page.context().close();
  });
  await test('Sequential edits in two tabs do not create conflict copies',async()=>{
    const page=await open(),other=await open('base',page.context());
    await capture(page,'#opening','Original question.');
    await other.waitForFunction(()=>document.querySelectorAll('.capture-card').length===1);
    const edit=async(tab,words)=>{
      await tab.locator('.capture-card').getByRole('button',{name:ui.edit_capture,exact:true}).click();
      await tab.locator('#capture-comment').fill(words);await tab.locator('#capture-form button[type="submit"]').click();
    };
    await edit(other,'Second tab edit.');
    await page.waitForFunction(()=>document.querySelector('.capture-card').textContent.includes('Second tab edit.'));
    await edit(page,'First tab edit after seeing the second.');
    await other.waitForFunction(()=>document.querySelector('.capture-card').textContent.includes('First tab edit after'));
    for(const tab of [page,other]){
      const doc=JSON.parse(await exported(tab));
      assert.equal(doc.annotations.length,1);assert.ok(!doc.annotations.some(a=>a.conflict_of));
      assert.equal(doc.annotations[0].comment,'First tab edit after seeing the second.');
    }
    await page.context().close();
  });
  await test('Recropped figure keeps its comment after the reader confirms it',async()=>{
    const page=await open();await page.locator('.figure-comment').click();
    await page.locator('#capture-comment').fill('Which arrow is learned?');await page.locator('#capture-form button[type="submit"]').click();
    const doc=JSON.parse(await exported(page));
    const changed=await open('recropped');await importDoc(changed,doc);
    const card=changed.locator('.capture-card');
    assert.equal(await changed.locator('.needs-review').count(),0);assert.equal(await card.evaluate(el=>el.classList.contains('needs-check')),true);
    assert.equal(await card.getByRole('button',{name:ui.jump_capture}).isDisabled(),false);
    await card.getByRole('button',{name:ui.accept_figure}).click();
    assert.equal(await changed.locator('.needs-check').count(),0);
    const updated=JSON.parse(await exported(changed)).annotations[0];
    assert.equal(updated.comment,'Which arrow is learned?');assert.equal(updated.target_history.length,1);
    assert.equal(updated.target.fingerprint,await changed.locator('#fig-method').getAttribute('data-figure-fingerprint'));
    assert.notEqual(updated.target.fingerprint,doc.annotations[0].target.fingerprint);
    await changed.reload();assert.equal(await changed.locator('.needs-check').count(),0);
    await page.context().close();await changed.context().close();
  });
  await test('Small nearby edit keeps the highlight, flagged until the reader confirms it',async()=>{
    const page=await open('edited');await importDoc(page,portable);
    assert.equal(await page.locator('.needs-review').count(),0);assert.equal(await page.locator('.needs-check').count(),1);
    assert.ok(await page.evaluate(()=>CSS.highlights.get('cv-captures').size===1));
    await page.locator('.capture-card').getByRole('button',{name:ui.confirm_anchor}).click();
    assert.equal(await page.locator('.needs-check').count(),0);
    const a=JSON.parse(await exported(page)).annotations[0];
    assert.equal(a.target.exact,portable.annotations[0].target.exact);assert.equal(a.target_history.length,1);
    assert.ok(a.target.suffix.startsWith(' This second sentence gives context'));
    await page.reload();assert.equal(await page.locator('.needs-check').count(),0);
    await page.context().close();
  });
  await test('Saving a capture at laptop/narrow width keeps the reading position',async()=>{
    const context=await browser.newContext({viewport:{width:1100,height:700},acceptDownloads:true});
    const page=await open('base',context);
    await page.locator('#technical').evaluate(el=>el.scrollIntoView({block:'center'}));
    const before=await page.evaluate(()=>scrollY);
    await capture(page);await page.waitForTimeout(300);
    assert.ok(Math.abs(await page.evaluate(()=>scrollY)-before)<5,'capture moved the reader away from the passage');
    assert.equal(await page.locator('#capture-toast').isVisible(),true);
    await context.close();
  });
  await test('A cleared selection cannot be reused for capture or reattachment',async()=>{
    const page=await open('rewritten');await importDoc(page,portable);
    await page.locator('.chapter p').first().evaluate(element=>{
      const range=document.createRange();range.selectNodeContents(element);getSelection().removeAllRanges();getSelection().addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    });
    assert.equal(await page.locator('#capture-selection').isVisible(),true);
    await page.evaluate(()=>{getSelection().removeAllRanges();document.body.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
    assert.equal(await page.locator('#capture-selection').isVisible(),false);
    await page.locator('.capture-card').getByRole('button',{name:ui.reattach_selection}).click();
    assert.equal(await page.locator('#annotation-status').textContent(),ui.select_to_reattach);
    assert.equal(await page.locator('.needs-review').count(),1);
    await page.context().close();
  });
  await test('Selection without a mouse or key release (touch) still offers capture',async()=>{
    const page=await open();
    await page.locator('#opening').evaluate(element=>{
      const range=document.createRange();range.selectNodeContents(element);getSelection().removeAllRanges();getSelection().addRange(range);
    });
    await page.waitForFunction(()=>!document.getElementById('capture-selection').classList.contains('hidden'));
    await page.context().close();
  });
  await test('Right-click a selection offers Highlight, Key idea, Comment; Highlight saves a plain capture',async()=>{
    const page=await open();await selectWords(page,'#opening','design intention');
    await rightClick(page,await wordPoint(page,'#opening','design'));
    assert.equal(await page.locator('#capture-menu').isVisible(),true);
    for(const label of [ui.menu_highlight,ui.menu_key_idea,ui.menu_comment])assert.equal(await menuItem(page,label).isVisible(),true,label);
    await menuItem(page,ui.menu_highlight).click();
    assert.equal(await page.locator('#capture-menu').isVisible(),false);
    const a=JSON.parse(await exported(page)).annotations[0];
    assert.equal(a.target.exact,'design intention');assert.equal(a.comment,'');assert.deepEqual(a.tags,[]);
    assert.equal(await highlightCount(page,'cv-highlight'),1);assert.equal(await highlightCount(page,'cv-key'),0);
    assert.equal(await page.locator('#capture-toast').isVisible(),true);
  });
  await test('Right-click a sentence with nothing selected marks the whole sentence as a key idea',async()=>{
    const page=await open();await page.evaluate(()=>getSelection().removeAllRanges());
    await rightClick(page,await wordPoint(page,'#opening','explains'));
    await menuItem(page,ui.menu_sentence_key).click();
    const a=JSON.parse(await exported(page)).annotations[0];
    assert.equal(a.target.exact,'This exact sentence explains the design intention.');assert.deepEqual(a.tags,['key idea']);
    assert.equal(await highlightCount(page,'cv-key'),1);
    assert.equal(await page.evaluate(()=>getSelection().isCollapsed),true);
  });
  await test('Comment opens a small box beside the passage with tag chips and keeps the reading position',async()=>{
    const page=await open();await selectWords(page,'#opening','design intention');
    const before=await page.evaluate(()=>scrollY);
    await rightClick(page,await wordPoint(page,'#opening','design'));await menuItem(page,ui.menu_comment).click();
    const box=page.locator('#capture-popover');assert.equal(await box.isVisible(),true);
    assert.equal(await page.evaluate(()=>!!document.querySelector('dialog[open]')),false,'comment box must not be a modal dialog');
    const passage=await page.locator('#opening').boundingBox(),popover=await box.boundingBox();
    assert.ok(popover.width<=460,'comment box is not small');
    assert.ok(Math.abs(popover.y-(passage.y+passage.height))<120||Math.abs(popover.y+popover.height-passage.y)<120,'comment box is not beside the passage');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'capture-comment');
    await page.locator('#capture-comment').fill('Is this the central claim?');await page.locator('#capture-tag input[value="key idea"]').check();
    await page.keyboard.press('ControlOrMeta+Enter');
    assert.equal(await box.isVisible(),false);
    assert.ok(Math.abs(await page.evaluate(()=>scrollY)-before)<5);
    const a=JSON.parse(await exported(page)).annotations[0];
    assert.equal(a.comment,'Is this the central claim?');assert.deepEqual(a.tags,['key idea']);
    assert.equal(await highlightCount(page,'cv-key'),1);
  });
  await test('Right-click an existing highlight to toggle key idea or remove it; Undo restores it',async()=>{
    const page=await open();await selectWords(page,'#opening','design intention');
    await rightClick(page,await wordPoint(page,'#opening','design'));await menuItem(page,ui.menu_highlight).click();
    const point=await wordPoint(page,'#opening','intention');
    await rightClick(page,point);
    for(const label of [ui.menu_add_comment,ui.menu_mark_key,ui.menu_remove])assert.equal(await menuItem(page,label).isVisible(),true,label);
    await menuItem(page,ui.menu_mark_key).click();assert.equal(await highlightCount(page,'cv-key'),1);
    await rightClick(page,point);assert.equal(await menuItem(page,ui.menu_unmark_key).isVisible(),true);
    await menuItem(page,ui.menu_remove).click();
    assert.equal(await highlightCount(page,'cv-captures'),0);
    assert.equal(JSON.parse(await exported(page)).annotations[0].status,'archived');
    await page.locator('#capture-toast').getByRole('button',{name:ui.undo}).click();
    assert.equal(await highlightCount(page,'cv-captures'),1);
    assert.equal(JSON.parse(await exported(page)).annotations[0].status,'open');
  });
  await test('Left-click a commented highlight opens its comment',async()=>{
    const page=await open();await capture(page,'#opening','Why does this design help?');
    await page.evaluate(()=>getSelection().removeAllRanges());
    const point=await wordPoint(page,'#opening','sentence');await page.mouse.click(point.x,point.y);
    assert.equal(await page.locator('#capture-popover').isVisible(),true);
    assert.equal(await page.locator('#capture-comment').inputValue(),'Why does this design help?');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#capture-popover').isVisible(),false);
  });
  await test('Shift+right-click and right-click outside the paper keep the browser menu; Escape closes ours',async()=>{
    const page=await open();
    const nativeKept=await page.evaluate(()=>[
      document.getElementById('opening').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,shiftKey:true,clientX:5,clientY:5})),
      document.querySelector('h1').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:5,clientY:5}))]);
    assert.deepEqual(nativeKept,[true,true]);assert.equal(await page.locator('#capture-menu').isVisible(),false);
    await rightClick(page,await wordPoint(page,'#opening','explains'));assert.equal(await page.locator('#capture-menu').isVisible(),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#capture-menu').isVisible(),false);
  });
  await test('Touch toolbar offers Highlight, Key idea, and Comment for a selection',async()=>{
    const page=await open();await selectWords(page,'#opening','design intention');
    await page.waitForFunction(()=>!document.getElementById('capture-selection').classList.contains('hidden'));
    assert.equal(await page.locator('#capture-selection button').count(),3);
    await page.locator('#capture-selection [data-action="key"]').click();
    assert.deepEqual(JSON.parse(await exported(page)).annotations[0].tags,['key idea']);
  });
  assert.deepEqual(failed,[],'Failed scenarios: '+failed.join('; '));assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks:passed.length,passed}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{clearTimeout(timer);if(browser)await browser.close();});
