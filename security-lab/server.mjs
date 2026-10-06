import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';

function encode(value){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');}
export function createLab(){
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE invoices(id TEXT,tenant TEXT,customer TEXT); INSERT INTO invoices VALUES('A-1','A','Cliente sintético A'),('B-1','B','Cliente sintético B');");
 let requests=0;
 const server=createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const url=new URL(req.url,'http://localhost');const safe=url.pathname.startsWith('/secure/');
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(req.method!=='GET')return send(405,{error:'GET only'});
  if(url.search.length>2048)return send(413,{error:'Fixture input too long'});
  if(url.pathname==='/health')return send(200,{lab:true,synthetic:true});
  if(!/^\/(vulnerable|secure)\/(idor|xss|sqli|rate)$/.test(url.pathname))return send(404,{error:'Fixture route not found'});
  try{
   if(url.pathname.endsWith('/idor')){
    const id=url.searchParams.get('id')??'A-1';
    const row=safe?db.prepare('SELECT * FROM invoices WHERE id=? AND tenant=?').get(id,'A'):db.prepare('SELECT * FROM invoices WHERE id=?').get(id);
    return send(row?200:404,row??{error:'Not found'});
   }
   if(url.pathname.endsWith('/sqli')){
    const customer=url.searchParams.get('customer')??'';
    // Deliberately vulnerable query exists ONLY in this isolated fixture, never in the product.
    const rows=safe?db.prepare('SELECT * FROM invoices WHERE customer=? AND tenant=?').all(customer,'A'):db.prepare("SELECT * FROM invoices WHERE tenant='A' AND customer='"+customer+"'").all();
    return send(200,rows);
   }
   if(url.pathname.endsWith('/xss')){
    const text=url.searchParams.get('text')??'Demostración';
    if(safe)res.setHeader('Content-Security-Policy',"default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end('<!doctype html><html lang="es"><title>Laboratorio sintético</title><body><h1>Revenia Security Lab</h1><p>'+(safe?encode(text):text)+'</p></body></html>');
   }
   if(safe&&++requests>3){res.setHeader('Retry-After','60');return send(429,{error:'Fixture limit reached; restart to reset'});}
   return send(200,{fixture:'No external action performed'});
  }catch{return send(400,{error:'Fixture query rejected'});}
 });
 server.on('close',()=>db.close());return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.env.LAB_ENABLED!=='true'||process.env.NODE_ENV==='production')throw new Error('LAB_DISABLED: explicit opt-in required; production forbidden');
 const host=process.env.LAB_CONTAINER==='true'?'0.0.0.0':'127.0.0.1';
 createLab().listen(4310,host,()=>console.log('Synthetic security lab ready on port 4310; never publish.'));
}
