import http from 'node:http';
import https from 'node:https';
export type CheckResult={id:string;title:string;status:'pass'|'fail'|'not_evaluated';severity:'high'|'medium'|'low'|'info';evidence:string;remediation:string};
export function localTarget(value:string){
 const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('LOCAL_TARGET_REQUIRED');return u;
}
// Literal loopback pinning: no DNS resolution, redirects or caller-supplied URLs.
export function probeLocal(origin:string,path:'/api/live'|'/api/v1/clients'):Promise<{status:number;headers:http.IncomingHttpHeaders}>{
 const url=localTarget(origin);
 return new Promise((resolve,reject)=>{
  const req=(url.protocol==='https:'?https:http).request({hostname:url.hostname==='[::1]'?'::1':'127.0.0.1',port:url.port||(url.protocol==='https:'?443:80),path,method:'GET',headers:{Host:url.host,'User-Agent':'Revenia-Internal-Checks/1.0'},timeout:4000},response=>{
   const status=response.statusCode??0;const headers=response.headers;response.destroy();if(status>=300&&status<400){reject(new Error('REDIRECT_BLOCKED'));return;}resolve({status,headers});
  });
  const deadline=setTimeout(()=>req.destroy(new Error('PROBE_TIMEOUT')),4500);
  req.on('timeout',()=>req.destroy(new Error('PROBE_TIMEOUT')));req.on('error',reject);req.on('close',()=>clearTimeout(deadline));req.end();
 });
}
export function headerChecks(headers:http.IncomingHttpHeaders,production:boolean):CheckResult[]{
 const csp=String(headers['content-security-policy']??'');const script=csp.split(';').find(v=>v.trim().startsWith('script-src '))??'';
 const checks:[string,string,boolean,CheckResult['severity'],string][]=[
 ['HTTP-CSP','Política de scripts',/nonce-[A-Za-z0-9+/=]+/.test(script)&&!script.includes("'unsafe-inline'")&&(!production||!script.includes("'unsafe-eval'")),'medium','Usar un nonce por respuesta y evitar scripts inline sin nonce.'],
 ['HTTP-MIME','Protección MIME',headers['x-content-type-options']==='nosniff','low','Enviar X-Content-Type-Options: nosniff.'],
 ['HTTP-FRAME','Protección frente a iframes',headers['x-frame-options']==='DENY'&&csp.includes("frame-ancestors 'none'"),'medium','Denegar marcos mediante CSP y X-Frame-Options.'],
 ['HTTP-REFERRER','Privacidad del referente',['no-referrer','strict-origin-when-cross-origin','same-origin'].includes(String(headers['referrer-policy'])),'low','Configurar una política restrictiva para el referente.']];
 return checks.map(([id,title,pass,severity,remediation])=>({id,title,status:pass?'pass':'fail',severity,evidence:pass?'Cabecera observada con la configuración esperada.':'La cabecera falta o no cumple la política seleccionada.',remediation}));
}
export function summarize(results:CheckResult[]){return {total:results.length,passed:results.filter(x=>x.status==='pass').length,failed:results.filter(x=>x.status==='fail').length,notEvaluated:results.filter(x=>x.status==='not_evaluated').length};}
