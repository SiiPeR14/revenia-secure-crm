import {lstat,readdir,readFile} from 'node:fs/promises';
import {join,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';

const roots=['src','public','database','ops','package.json','package-lock.json','next.config.ts','tsconfig.json','eslint.config.mjs','Dockerfile','compose.production.yml','.dockerignore'];
const forbidden=/(^|\/)(?:\.env[^/]*|\.git|\.next|node_modules|\.revenia|releases|coverage|backups?)(\/|$)|\.(?:log|pem|key|pfx|p12|dump|sqlite|bak)$/i;
const credentialPatterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\b(?:sk_live_|rk_live_)[A-Za-z0-9]{12,}/,/\bsk-proj-[A-Za-z0-9_-]{20,}/,/\bAKIA[A-Z0-9]{16}\b/,/\bghp_[A-Za-z0-9]{30,}\b/];

export async function releaseFiles(root){
  const files=[];
  async function visit(path){
    const name=relative(root,path).split(sep).join('/');
    if(forbidden.test(name))throw new Error(`Archivo privado no permitido en las fuentes: ${name}`);
    const stat=await lstat(path);
    if(stat.isSymbolicLink())throw new Error(`Enlace simbólico no permitido: ${name}`);
    if(stat.isDirectory()){
      for(const entry of (await readdir(path)).sort())await visit(join(path,entry));
    }else if(stat.isFile()){
      const data=await readFile(path);
      // This heuristic is an additional gate, not proof that arbitrary content is public.
      if(credentialPatterns.some(pattern=>pattern.test(data.toString('utf8'))))throw new Error(`Posible credencial en ${name}; revisa el archivo sin copiarla a los registros.`);
      files.push({name,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
    }else throw new Error(`Tipo de archivo no permitido: ${name}`);
  }
  for(const entry of roots)await visit(join(root,entry));
  return files.sort((a,b)=>a.name.localeCompare(b.name,'en'));
}
export function fingerprint(files){return createHash('sha256').update(JSON.stringify(files)).digest('hex');}
