import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {hashPassword} from '../src/lib/security/password.ts';
import {deliverRecovery} from '../src/lib/auth/recovery-service.ts';
import {closeDatabase} from '../src/lib/db/pool.ts';
const tenant=randomUUID(),user=randomUUID(),email=user+'@example.test',password='E2E-Revenia-password-2026';
const admin=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{
 await admin.connect();await admin.query("INSERT INTO tenants(id,slug,name) VALUES($1,$2,'Portfolio E2E')",[tenant,'e2e-'+tenant]);
 await admin.query("INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,'E2E User',$3)",[user,email,await hashPassword(password)]);
 await admin.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'OWNER')",[tenant,user]);
});
test.afterAll(async()=>{
 for(const table of ['security_findings','security_runs','tasks','clients','audit_logs','memberships'])await admin.query('DELETE FROM '+table+' WHERE tenant_id=$1',[tenant]);
 await admin.query('DELETE FROM users WHERE id=$1',[user]);await admin.query('DELETE FROM tenants WHERE id=$1',[tenant]);await admin.end();await closeDatabase();
});
test.beforeEach(async({page})=>{
 await page.goto('/login');await page.getByLabel('Correo electrónico',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar en Revenia'}).click();await expect(page).toHaveURL(/dashboard/);
});
test('creates a client through the UI, persists it and rejects stale or forged API writes',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const cookie=(await context.cookies()).find(c=>c.name==='revenia_session');expect(cookie?.httpOnly).toBe(true);expect(cookie?.sameSite).toBe('Strict');
 await page.goto('/clientes?nuevo=1');await page.getByLabel('Nombre',{exact:true}).fill('Cliente E2E');await page.getByLabel('Empresa',{exact:true}).fill('Empresa E2E');await page.getByLabel('Correo',{exact:true}).fill('cliente-e2e@example.test');await page.getByLabel('Valor potencial',{exact:true}).fill('99.25');await page.getByRole('button',{name:'Guardar cliente'}).click();
 await expect(page.getByText('Cliente guardado.',{exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'Cliente E2E',exact:true})).toBeVisible();
 const response=await context.request.get('/api/v1/clients');expect(response.status()).toBe(200);const client=(await response.json()).data[0];expect(client.value).toBe('99.25');expect(client.tenant_id).toBeUndefined();
 const edit=await context.request.patch('/api/v1/clients/'+client.id,{headers:{Origin:'http://localhost:3000'},data:{version:client.version,name:'Cliente actualizado'}});expect(edit.status()).toBe(200);
 const conflict=await context.request.patch('/api/v1/clients/'+client.id,{headers:{Origin:'http://localhost:3000'},data:{version:client.version,name:'Sobrescritura'}});expect(conflict.status()).toBe(409);
 const csrf=await context.request.patch('/api/v1/clients/'+client.id,{headers:{Origin:'https://evil.example'},data:{version:2,name:'Ataque'}});expect(csrf.status()).toBe(403);
 await page.reload();await expect(page.getByRole('cell',{name:'Cliente actualizado',exact:true})).toBeVisible();expect(errors).toEqual([]);
});
test('runs real security checks and exports authenticated evidence',async({page,context})=>{
 await page.goto('/seguridad');await expect(page.getByRole('heading',{name:'Seguridad con evidencia'})).toBeVisible();await page.getByRole('button',{name:'Ejecutar comprobación'}).click();await expect(page.getByText('Comprobación terminada.',{exact:false})).toBeVisible();
 const report=await context.request.get('/api/v1/security/report');expect(report.status()).toBe(200);const body=await report.json();expect(body.runs[0].status).toBe('completed');expect(body.runs[0].results.some((r:{id:string;status:string})=>r.id==='DB-RLS'&&r.status==='pass')).toBe(true);
 expect(body.runs[0].results.some((r:{id:string;status:string})=>r.id==='HTTP-CSP'&&r.status==='pass')).toBe(true);
 const schema=await context.request.get('/api/v1/openapi');expect((await schema.json()).openapi).toBe('3.1.0');await page.screenshot({path:'.revenia/security-center-desktop.png',fullPage:true});
});
test('keeps client and security pages usable on a narrow screen',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 for(const route of ['/clientes','/seguridad','/tareas','/api-docs']){await page.goto(route);await expect(page.locator('h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);}
 await page.screenshot({path:'.revenia/portfolio-mobile.png',fullPage:true});
});
test('keeps form controls named and keyboard focus visible',async({page})=>{
 await page.goto('/clientes?nuevo=1');
 const unnamed=await page.locator('input,select,textarea,button').evaluateAll(elements=>elements.filter(element=>{
   const el=element as HTMLInputElement;
   if(el.type==='hidden'||(element as HTMLElement).offsetParent===null)return false;
   if((el as HTMLButtonElement).disabled)return false;
   const labelled=el.labels?.length||el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||el.textContent?.trim();
   return !labelled;
 }).length);
 expect(unnamed).toBe(0);
 const focus=await page.getByLabel('Nombre',{exact:true}).evaluate(element=>{
   (element as HTMLElement).focus();
   const style=getComputedStyle(element);
   return style.outlineStyle!=='none'||style.boxShadow!=='none';
 });
 expect(focus).toBe(true);
});
test('recovers access with a single-use fragment token and invalidates the old session',async({page,context})=>{
 await page.goto('/recuperar-acceso');await page.getByLabel('Correo electrónico').fill(email);await page.getByRole('button',{name:'Enviar enlace'}).click();await expect(page.getByRole('status')).toContainText('Si existe una cuenta activa');
 const row=(await admin.query('SELECT id FROM password_recovery WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',[user])).rows[0];let link='';
 await deliverRecovery(async message=>{link=message.link;},row.id);expect(link).toContain('/restablecer-acceso#');
 await page.goto(link);await page.getByLabel('Nueva contraseña',{exact:true}).fill('E2E-Revenia-new-password-2026');await page.getByLabel('Repetir contraseña').fill('E2E-Revenia-new-password-2026');await page.getByRole('button',{name:'Cambiar contraseña'}).click();await expect(page.getByRole('status')).toContainText('Contraseña cambiada');
 expect((await context.request.get('/api/v1/clients')).status()).toBe(401);
 await page.goto('/login');await page.getByLabel('Correo electrónico',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill('E2E-Revenia-new-password-2026');await page.getByRole('button',{name:'Entrar en Revenia'}).click();await expect(page).toHaveURL(/dashboard/);
});
