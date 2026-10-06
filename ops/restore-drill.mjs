import {spawn} from 'node:child_process';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import pg from 'pg';

const source=new URL(process.env.MIGRATION_DATABASE_URL??'');
if(!['127.0.0.1','localhost'].includes(source.hostname)||source.port!=='54329'||source.pathname!=='/revenia')throw new Error('This drill is restricted to the local Revenia Docker database.');
const temporary='revenia_restore_'+randomUUID().replaceAll('-','');
if(!/^revenia_restore_[a-f0-9]{32}$/.test(temporary))throw new Error('Invalid temporary name');
const admin=new pg.Client({connectionString:source.href});
const directory=resolve('.revenia','backups',new Date().toISOString().replaceAll(':','-'));await mkdir(directory,{recursive:true});
const dump=resolve(directory,'revenia.dump');
async function docker(args,input,output){
 const child=spawn('docker',['compose','exec','-T','database',...args],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
 let error='';child.stderr.on('data',d=>{error+=d.toString();});
 const completion=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('PostgreSQL tool failed; inspect locally. '+error.slice(0,300))));});
 const streams=[];if(input)streams.push(pipeline(createReadStream(input),child.stdin));else child.stdin.end();
 if(output)streams.push(pipeline(child.stdout,createWriteStream(output,{flags:'wx'})));else child.stdout.resume();
 await Promise.all([completion,...streams]);
}
let created=false,restore;
const started=Date.now();
try{
 await admin.connect();await admin.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const snapshot=(await admin.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
 const expected=(await admin.query('SELECT (SELECT count(*) FROM clients)::int clients,(SELECT count(*) FROM invoices)::int invoices,(SELECT count(*) FROM audit_logs)::int audits')).rows[0];
 await docker(['pg_dump','-U',source.username,'-d','revenia','-Fc','--snapshot='+snapshot],null,dump);
 await admin.query('COMMIT');await admin.query('CREATE DATABASE '+temporary);created=true;
 await docker(['pg_restore','-U',source.username,'--exit-on-error','--no-owner','-d',temporary],dump,null);
 const target=new URL(source);target.pathname='/'+temporary;restore=new pg.Client({connectionString:target.href});await restore.connect();
 const actual=(await restore.query('SELECT (SELECT count(*) FROM clients)::int clients,(SELECT count(*) FROM invoices)::int invoices,(SELECT count(*) FROM audit_logs)::int audits')).rows[0];
 if(JSON.stringify(expected)!==JSON.stringify(actual))throw new Error('Restored row counts do not match snapshot.');
 const insecure=(await restore.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND has_table_privilege('revenia_app',c.oid,'SELECT') AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant_id') AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)")).rows;
 if(insecure.length)throw new Error('RLS restoration failed.');
 const app=new URL(process.env.DATABASE_URL);app.pathname='/'+temporary;process.env.DATABASE_URL=app.href;
 const {verifyStoredAudit}=await import('../src/lib/db/audit-verification.ts');const {closeDatabase}=await import('../src/lib/db/pool.ts');
 let audited=0;
 try{for(const row of (await restore.query('SELECT id FROM tenants')).rows){const result=await verifyStoredAudit(row.id);if(result.status==='broken'||result.status==='partial')throw new Error('Restored audit requires investigation.');audited++;}}finally{await closeDatabase();}
 const report={at:new Date().toISOString(),status:'passed',elapsedSeconds:Math.round((Date.now()-started)/1000),snapshotCounts:actual,tenantsAudited:audited,scope:'Local dump restored in a fresh disposable database; counts, forced RLS and audit chains checked. Legacy audit entries are not cryptographically verified.'};
 await writeFile(resolve(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{
 await restore?.end();if(created)await admin.query('DROP DATABASE '+temporary);await admin.end();
}
