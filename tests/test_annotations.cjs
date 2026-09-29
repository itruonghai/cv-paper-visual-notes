const {test} = require('node:test');
const assert = require('node:assert/strict');
const A = require('../skills/cv-paper-visual-notes/assets/annotations.js');
const annotation = () => ({id:'ann-one',kind:'text',section_id:'method',section_title:'Method',content_revision:'r1',comment:'My exact words',created_at:'2026-09-28',updated_at:'2026-09-28',status:'open',tags:['question'],source:{kind:'notebook-prose',ref:'notebook.html#method'},target:{exact:'the mechanism',prefix:'See ',suffix:' clearly.',start:4,end:17}});
const document = () => ({schema_version:1,paper_id:'paper',version:'v1',annotations:[annotation()]});
test('Repeated import preserves IDs and does not duplicate records',()=>{
  const d=document();assert.deepEqual(A.merge(null,d,d).doc.annotations,d.annotations);
});
test('Disjoint concurrent edits merge without losing words',()=>{
  const base=document(),local=A.clone(base),remote=A.clone(base);
  local.annotations[0].comment='Local revised question';
  remote.annotations.push({...annotation(),id:'ann-two',comment:'Remote addition'});
  const result=A.merge(base,local,remote);assert.equal(result.conflicts,0);
  assert.deepEqual(result.doc.annotations.map(a=>a.comment),['Local revised question','Remote addition']);
});
test('Same-ID concurrent edits keep both; reimporting conflict is idempotent',()=>{
  const base=document(),local=A.clone(base),remote=A.clone(base);
  local.annotations[0].comment='Local';remote.annotations[0].comment='Remote';
  const result=A.merge(base,local,remote);assert.equal(result.conflicts,1);
  assert.equal(result.doc.annotations[0].id,'ann-one');
  assert.equal(result.doc.annotations[1].conflict_of,'ann-one');
  assert.equal(A.merge(null,result.doc,remote).doc.annotations.length,2);
});
test('Unchanged local record accepts an external reader update',()=>{
  const base=document(),remote=A.clone(base);remote.annotations[0].status='resolved';
  assert.equal(A.merge(base,base,remote).doc.annotations[0].status,'resolved');
});
test('Wrong paper, future schema, and duplicate IDs reject without mutation',()=>{
  const own=document(),before=A.clone(own);
  for(const remote of [{...document(),schema_version:2},{...document(),paper_id:'other'},{...document(),annotations:[annotation(),annotation()]}]){
    assert.throws(()=>A.merge(null,own,remote));assert.deepEqual(own,before);
  }
});
test('Identical revision uses offsets; changed revision requires clear context',()=>{
  const target=annotation().target;
  assert.deepEqual(A.locate('See the mechanism clearly.',target,true),{start:4,end:17});
  assert.deepEqual(A.locate('Preface. See the mechanism clearly.',target,false),{start:13,end:26});
  assert.equal(A.locate('See the mechanism clearly. See the mechanism clearly.',target,false),null);
});
test('Unique text with one intact side of context stays attached but flagged for review',()=>{
  const target=annotation().target;
  assert.deepEqual(A.locate('See the mechanism differently.',target,false),{start:4,end:17,drifted:true});
  const old='The encoder maps patches to tokens. The decoder reconstructs masked patches from visible tokens.';
  const s=old.indexOf('reconstructs masked'),e=s+'reconstructs masked'.length;
  const long={exact:'reconstructs masked',prefix:old.slice(Math.max(0,s-48),s),suffix:old.slice(e,e+48),start:s,end:e};
  const typo=old.replace('maps patches','maps image patches'),at=typo.indexOf('reconstructs masked');
  assert.deepEqual(A.locate(typo,long,false),{start:at,end:at+19,drifted:true});
  assert.deepEqual(A.locate(old.replace('visible tokens','the visible tokens'),long,false),{start:s,end:e,drifted:true});
});
test('Changed context on both sides or repeated text still needs reattachment',()=>{
  const target=annotation().target;
  assert.equal(A.locate('Now the mechanism works.',target,false),null);
  assert.equal(A.locate('See the mechanism now. See the mechanism later.',target,false),null);
});
test('Digest preserves origin, quote, words, IDs, and orphan state',()=>{
  const d=document(),a=d.annotations[0];a.comment='First line\n<script>literal reader text</script>';
  const digest=A.digest(d,d.annotations,{'ann-one':false});
  for(const value of ['notebook-prose','ann-one','needs reattachment','the mechanism',a.comment])assert.ok(digest.includes(value));
});
test('Sentence under a position keeps academic abbreviations inside one sentence',()=>{
  const at=(text,word)=>{const s=A.sentenceAt(text,text.indexOf(word));return text.slice(s.start,s.end);};
  const text='Scope. The loss follows (Eq. 2) and Fig. 3 shows it, as in Marks et al. (2024), e.g. on ViTs. Next claim here.';
  assert.equal(at(text,'loss'),'The loss follows (Eq. 2) and Fig. 3 shows it, as in Marks et al. (2024), e.g. on ViTs.');
  assert.equal(at(text,'ViTs'),'The loss follows (Eq. 2) and Fig. 3 shows it, as in Marks et al. (2024), e.g. on ViTs.');
  assert.equal(at(text,'Next'),'Next claim here.');
  assert.equal(at(text,'Scope'),'Scope.');
  assert.equal(at('Inherited from Ameisen et al. Trained on tokens (Sec. 3.2).','Trained'),'Inherited from Ameisen et al. Trained on tokens (Sec. 3.2).');
  const lead='  Two claims. ';assert.deepEqual(A.sentenceAt(lead,4),{start:2,end:13});
  assert.equal(A.sentenceAt('   ',1),null);
});
