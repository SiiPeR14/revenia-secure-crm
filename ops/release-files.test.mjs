import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {releaseFiles,fingerprint} from './release-files.mjs';

async function fixture(fn){
  const root=await mkdtemp(join(tmpdir(),'revenia-release-test-'));
  try{
    for(const dir of ['src','public','database','ops'])await mkdir(join(root,dir));
    for(const name of ['package.json','package-lock.json','next.config.ts','next-env.d.ts','tsconfig.json','eslint.config.mjs','Dockerfile','compose.production.yml','.dockerignore'])await writeFile(join(root,name),'fixture');
    await fn(root);
  }finally{await rm(root,{recursive:true,force:true});}
}
test('excludes root credentials, logs, local data and earlier releases',()=>fixture(async root=>{
  await writeFile(join(root,'.env.local'),'never copy this');
  for(const dir of ['.revenia','releases','backups']){await mkdir(join(root,dir));await writeFile(join(root,dir,'private.txt'),'private');}
  const files=await releaseFiles(root);
  assert.equal(files.length,8);
  assert.ok(!files.some(f=>f.name.includes('private')||f.name.includes('.env')));
}));
test('rejects private configuration inside selected source directories',()=>fixture(async root=>{
  await writeFile(join(root,'src','.env.production'),'private');
  await assert.rejects(releaseFiles(root),/privado/);
}));
test('rejects recognizable credentials without disclosing their value',()=>fixture(async root=>{
  await writeFile(join(root,'src','accidental.ts'),['sk','live','a'.repeat(24)].join('_'));
  await assert.rejects(releaseFiles(root),error=>error.message.includes('src/accidental.ts')&&!error.message.includes('a'.repeat(24)));
}));
test('source changes invalidate the fingerprint',()=>fixture(async root=>{
  const before=fingerprint(await releaseFiles(root));
  await writeFile(join(root,'src','changed.ts'),'export const revision=2;');
  assert.notEqual(fingerprint(await releaseFiles(root)),before);
}));
test('rejects directory links which could escape the project',()=>fixture(async root=>{
  await symlink(tmpdir(),join(root,'src','escape'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(releaseFiles(root),/simbólico/);
}));
