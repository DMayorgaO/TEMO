const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtemp,writeFile,rm,mkdir,symlink}=require('node:fs/promises');const {tmpdir}=require('node:os');const path=require('node:path');const {execFileSync}=require('node:child_process');
const lib=()=>import('../../scripts/lib/release-candidate.mjs');
test('release gate rejects private paths, traversal and credentials without displaying values',async()=>{
 const {assertReleasePath,assertReleaseContent}=await lib();
 for(const file of ['../secret','/secret','x\\y','docs/../secret','tmp/log.txt','backups/test.dump','.env.production','backend/.env','config/production.env','docs/INFORME_SEGURIDAD_TEMO.md','frontend/gastos.ts','x/key.pem'])assert.throws(()=>assertReleasePath(file));
 for(const file of ['.env.example','config/environments/production.env.example','scripts/backup-database.ps1','backend/src/app.ts'])assert.doesNotThrow(()=>assertReleasePath(file));
 const secret='fixture-secret-NOT-a-real-credential';
 for(const value of [secret,encodeURIComponent(secret),'-----BEGIN '+'PRIVATE KEY-----'])assert.throws(()=>assertReleaseContent('test.ts',Buffer.from(value),[secret]),e=>!e.message.includes(secret));
});
test('release manifest includes staged, unstaged and new files and rejects later drift',async()=>{
 const {releaseManifest,verifyReleaseManifest}=await lib();const root=await mkdtemp(path.join(tmpdir(),'temo-release-fixture-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
 try{
  git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  await writeFile(path.join(root,'base.txt'),'base');git('add','base.txt');git('commit','-m','fixture');
  await writeFile(path.join(root,'base.txt'),'staged');git('add','base.txt');await writeFile(path.join(root,'base.txt'),'working');
  await writeFile(path.join(root,'new.txt'),'new');const manifest=await releaseManifest(root);
  assert.equal(manifest.files.length,2);assert.deepEqual(manifest.changed,['base.txt','new.txt']);assert.ok(verifyReleaseManifest(manifest,await releaseManifest(root)));
  await writeFile(path.join(root,'new.txt'),'changed');const changed=await releaseManifest(root);assert.throws(()=>verifyReleaseManifest(manifest,changed));
  assert.notDeepEqual(manifest,await releaseManifest(root));assert.throws(()=>verifyReleaseManifest(manifest,{...manifest,base:'different'}));
  await mkdir(path.join(root,'backups'));await writeFile(path.join(root,'backups','x.dump'),'private');await assert.rejects(releaseManifest(root));
 }finally{assert.equal(path.dirname(root),path.resolve(tmpdir()));assert.ok(path.basename(root).startsWith('temo-release-fixture-'));await rm(root,{recursive:true,force:true});}
});
test('release gate refuses hidden tracked changes, symbolic Git entries and conflicts',async()=>{
 const {releaseManifest}=await lib();const root=await mkdtemp(path.join(tmpdir(),'temo-release-fixture-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe']});
 try{
  git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');await writeFile(path.join(root,'base.txt'),'base');git('add','base.txt');git('commit','-m','fixture');
  git('update-index','--assume-unchanged','base.txt');await assert.rejects(releaseManifest(root));git('update-index','--no-assume-unchanged','base.txt');
  git('update-index','--skip-worktree','base.txt');await assert.rejects(releaseManifest(root));git('update-index','--no-skip-worktree','base.txt');
  const blob=git('rev-parse','HEAD:base.txt').trim();git('update-index','--add','--cacheinfo','120000',blob,'link');await assert.rejects(releaseManifest(root));git('update-index','--force-remove','link');
  execFileSync('git',['update-index','--index-info'],{cwd:root,input:`100644 ${blob} 1\tconflict\n100644 ${blob} 2\tconflict\n100644 ${blob} 3\tconflict\n`,stdio:['pipe','pipe','pipe']});await assert.rejects(releaseManifest(root));
 }finally{assert.equal(path.dirname(root),path.resolve(tmpdir()));assert.ok(path.basename(root).startsWith('temo-release-fixture-'));await rm(root,{recursive:true,force:true});}
});
test('release gate rejects filesystem junctions and scans file contents including staged secrets',async()=>{
 const {releaseManifest}=await lib();const root=await mkdtemp(path.join(tmpdir(),'temo-release-fixture-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
 try{
  git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');await writeFile(path.join(root,'base.txt'),'base');git('add','base.txt');git('commit','-m','fixture');
  const secret='fixture-detected-secret-value';await writeFile(path.join(root,'base.txt'),secret);git('add','base.txt');await assert.rejects(releaseManifest(root,[secret]),e=>!e.message.includes(secret));await writeFile(path.join(root,'base.txt'),'safe');await assert.rejects(releaseManifest(root,[secret]));git('add','base.txt');await releaseManifest(root,[secret]);
  await mkdir(path.join(root,'target'));await writeFile(path.join(root,'target','safe.txt'),'safe');await symlink(path.join(root,'target'),path.join(root,'linked'),'junction');await assert.rejects(releaseManifest(root));
 }finally{assert.equal(path.dirname(root),path.resolve(tmpdir()));assert.ok(path.basename(root).startsWith('temo-release-fixture-'));await rm(root,{recursive:true,force:true});}
});
