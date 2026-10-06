import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {database} from '../db/pool.ts';
import {withTenant} from '../db/tenant-transaction.ts';
import {recordAudit} from '../db/audit-repository.ts';
import {hashPassword,verifyPassword} from '../security/password.ts';
import {consumeLoginAttempt} from '../redis/login-rate-limit.ts';
import {publicOrigin} from '../engines/connections.ts';
import {AccountError,authenticateAccount,passwordInput,tokenDigest} from './account-service.ts';

export const invitationRole=z.enum(['ADMIN','MANAGER','SALES','EMPLOYEE','VIEWER']);
const inviteToken=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export async function createInvitation(sessionToken:string,password:string,email:string,role:string){
  const address=z.email().max(200).parse(email.trim().toLowerCase());invitationRole.parse(role);
  const {digest,principal,expected}=await authenticateAccount(sessionToken,password);
  const origin=publicOrigin();const token=randomBytes(32).toString('base64url');
  await withTenant(principal.tenant_id,async db=>{
    const result=await db.query<{id:string|null}>('SELECT revenia_invite_create($1,$2,$3,$4,$5) id',[digest,expected,address,role,tokenDigest(token)]);
    if(!result.rows[0]?.id)throw new AccountError('No se puede crear la invitación. Comprueba tu rol, si la persona ya pertenece al equipo o si hay demasiadas invitaciones pendientes.');
    await recordAudit(db,{tenantId:principal.tenant_id,userId:principal.user_id},'team.invitation_created','invitation',result.rows[0].id,{role});
  });
  return `${origin}/aceptar-invitacion#token=${token}`;
}
export async function listInvitations(token:string){
  return (await database.query<{id:string;email:string;role:string;created_at:Date;expires_at:Date;revoked_at:Date|null;accepted_at:Date|null}>('SELECT * FROM revenia_invite_list($1)',[tokenDigest(token)])).rows;
}
export async function revokeInvitation(token:string,password:string,id:string){
  z.uuid().parse(id);const {digest,principal,expected}=await authenticateAccount(token,password);
  await withTenant(principal.tenant_id,async db=>{
    const result=await db.query<{ok:boolean}>('SELECT revenia_invite_revoke($1,$2,$3) ok',[digest,expected,id]);
    if(!result.rows[0]?.ok)throw new AccountError('La invitación ya no está disponible o no tienes permiso.');
    await recordAudit(db,{tenantId:principal.tenant_id,userId:principal.user_id},'team.invitation_revoked','invitation',id);
  });
}
export async function acceptInvitation(rawToken:string,name:string,password:string){
  const digest=tokenDigest(inviteToken.parse(rawToken));const displayName=z.string().trim().min(2).max(120).parse(name);passwordInput.parse(password);
  if(!(await consumeLoginAttempt(`invitation:${digest}`)).allowed)throw new AccountError('Demasiados intentos. Espera 15 minutos.');
  const invitation=(await database.query<{id:string;tenant_id:string;existing_user:string|null;password_hash:string|null}>('SELECT id,tenant_id,existing_user,password_hash FROM revenia_invite_lookup($1)',[digest])).rows[0];
  if(!invitation)throw new AccountError('La invitación no está disponible. Puede haber caducado, haber sido retirada o ya haberse utilizado.');
  if(invitation.existing_user&&(!invitation.password_hash||!await verifyPassword(password,invitation.password_hash)))throw new AccountError('Si ya tienes cuenta, introduce tu contraseña actual.');
  const newHash=invitation.existing_user?null:await hashPassword(password);
  await withTenant(invitation.tenant_id,async db=>{
    const result=await db.query<{id:string|null}>('SELECT revenia_invite_accept($1,$2,$3,$4) id',[digest,invitation.password_hash,displayName,newHash]);
    if(!result.rows[0]?.id)throw new AccountError('La invitación o la cuenta han cambiado. Revisa los datos e inténtalo de nuevo.');
    await recordAudit(db,{tenantId:invitation.tenant_id,userId:result.rows[0].id},'team.invitation_accepted','invitation',invitation.id);
  });
}
