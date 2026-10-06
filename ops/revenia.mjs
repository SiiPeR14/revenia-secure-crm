import {readFile,writeFile,mkdir,copyFile,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {releaseFiles,fingerprint} from './release-files.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const state=join(root,'.revenia','operations');
const command=process.argv[2]??'help';
const allowed=['doctor','verify','prepare','help'];

async function runNpm(script){
  const cli=process.env.npm_execpath??join(dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
  await lstat(cli);
  await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[cli,'run',script],{cwd:root,stdio:'inherit',shell:false,windowsHide:true});
    child.on('error',reject);
    child.on('exit',code=>code===0?resolve():reject(new Error(`La comprobación ${script} no ha terminado correctamente.`)));
  });
}
async function doctor(){
  const checks=[];
  checks.push({name:'Node.js 24 o posterior',ok:Number(process.versions.node.split('.')[0])>=24});
  for(const file of ['node_modules','.env.local','Dockerfile','compose.production.yml']){
    checks.push({name:`Disponible: ${file}`,ok:await lstat(join(root,file)).then(()=>true,()=>false)});
  }
  try{
    const response=await fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(5000),redirect:'error'});
    checks.push({name:'Salud local de aplicación y dependencias',ok:response.ok});
  }catch{checks.push({name:'Salud local de aplicación y dependencias',ok:false});}
  for(const check of checks)console.log(`${check.ok?'OK':'PENDIENTE'}  ${check.name}`);
  console.log('No se han leído ni mostrado credenciales. Este diagnóstico no certifica producción.');
  if(checks.some(check=>!check.ok))process.exitCode=1;
}
async function verify(){
  const before=fingerprint(await releaseFiles(root));
  await runNpm('test:all:docker');
  await runNpm('test:ops');
  await runNpm('test:portfolio');
  await runNpm('test:lab');
  await runNpm('test:e2e');
  const after=fingerprint(await releaseFiles(root));
  if(before!==after)throw new Error('Las fuentes cambiaron durante las pruebas. Repite la verificación.');
  await mkdir(state,{recursive:true});
  await writeFile(join(state,'verified.json'),JSON.stringify({verifiedAt:new Date().toISOString(),fingerprint:after,node:process.versions.node},null,2));
  console.log('Verificación registrada. Ya puedes preparar una copia local de esta versión.');
}
async function prepare(){
  const files=await releaseFiles(root);
  const hash=fingerprint(files);
  const proof=JSON.parse(await readFile(join(state,'verified.json'),'utf8').catch(()=>{throw new Error('Primero ejecuta npm run ops:verify con PostgreSQL y Redis activos.');}));
  if(proof.fingerprint!==hash)throw new Error('Las fuentes han cambiado desde las últimas pruebas. Repite npm run ops:verify.');
  const label=`revenia-${new Date().toISOString().replace(/[:.]/g,'-')}-${hash.slice(0,10)}`;
  const destination=join(root,'releases',label);
  // Never overwrite an existing artifact, follow symlinks, or include the local environment.
  await mkdir(join(root,'releases'),{recursive:true});
  if((await lstat(join(root,'releases'))).isSymbolicLink())throw new Error('La carpeta releases no puede ser un enlace.');
  await mkdir(destination);
  for(const file of files){
    const target=join(destination,...file.name.split('/'));
    await mkdir(dirname(target),{recursive:true});
    await copyFile(join(root,...file.name.split('/')),target);
  }
  if(fingerprint(await releaseFiles(destination))!==hash)throw new Error('La copia no coincide con las fuentes verificadas. No utilices este artefacto.');
  await writeFile(join(destination,'RELEASE-MANIFEST.json'),JSON.stringify({label,fingerprint:hash,verification:proof,files},null,2));
  await writeFile(join(destination,'LEER-ANTES-DE-PUBLICAR.txt'),'COPIA LOCAL VERIFICADA. NO ES UNA AUTORIZACIÓN DE LANZAMIENTO.\nNo contiene archivos .env, registros, volúmenes ni copias de datos. El escáner de secretos es heurístico: revisar el contenido antes de transferirlo.\nIncluye código de pruebas y seed; NO ejecutar seed en producción.\nPendientes: cuentas reales, configuración de producción, auditoría, backups, restauración, alta segura, revisión legal, staging y autorización del propietario.\nNo se ha ejecutado Docker build, push, despliegue ni ninguna operación externa.\n');
  console.log(`Copia local preparada: ${destination}`);
}
try{
  if(!allowed.includes(command))throw new Error('Operación desconocida. Opciones: doctor, verify, prepare.');
  if(command==='doctor')await doctor();
  else if(command==='verify')await verify();
  else if(command==='prepare')await prepare();
  else console.log('Revenia: npm run ops:doctor | npm run ops:verify | npm run ops:prepare. Todo local; ninguna opción publica.');
}catch(error){console.error(error instanceof Error?error.message:'Operación no completada.');process.exitCode=1;}
