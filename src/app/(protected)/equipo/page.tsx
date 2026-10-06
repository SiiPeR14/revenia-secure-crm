import {InvitationForm} from '@/components/invitation-form';
import {listInvitations} from '@/lib/auth/invitation-service';
import {revokeInvitationAction} from '@/app/invitation-actions';
import {cookies} from 'next/headers';
import {requireSession} from '@/lib/auth/current-session';
import {requirePermission} from '@/lib/security/rbac';
import {teamMembers} from '@/lib/auth/account-service';
import {updateMemberAction} from '@/app/account-actions';
import {PageFeedback} from '@/components/page-feedback';
import {SubmitButton} from '@/components/submit-button';

export default async function TeamPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const session=await requireSession();requirePermission(session.role,'user:manage');
  const token=(await cookies()).get('revenia_session')!.value; const [members,invitations,query]=await Promise.all([teamMembers(token),listInvitations(token),searchParams]);
  return <main className="page-stack"><header className="page-heading"><div><p className="eyebrow">ACCESOS DE EMPRESA</p><h1>Equipo</h1><p>El propietario administra los permisos del equipo y confirma los cambios con su contraseña.</p></div></header><PageFeedback error={query.error} success={query.invitacionRetirada?'Invitación retirada.':query.guardado?'Acceso actualizado. Las sesiones anteriores de ese miembro en esta empresa se han cerrado.':undefined}/>
    <p className="secure-note">Los propietarios están protegidos: desde aquí no puedes eliminar ni cambiar su rol, tampoco tu propio acceso. Cambiar un rol exige que el miembro vuelva a iniciar sesión.</p>
    <section className="account-grid">{members.map(member=><article className="panel account-panel" key={member.user_id}><h2>{member.display_name}</h2><p>{member.email}</p><span className="badge">{member.role}</span>{session.role==='OWNER'&&member.role!=='OWNER'&&member.user_id!==session.userId?<form className="form-grid" action={updateMemberAction}><input type="hidden" name="userId" value={member.user_id}/><label className="wide">Rol<select name="role" defaultValue={member.role}><option value="ADMIN">Administrador</option><option value="MANAGER">Responsable comercial</option><option value="SALES">Comercial</option><option value="EMPLOYEE">Empleado</option><option value="VIEWER">Solo lectura</option></select></label><label className="wide">Tu contraseña actual<input type="password" name="currentPassword" autoComplete="current-password" minLength={12} maxLength={200} required/></label><div className="wide row-actions"><SubmitButton name="operation" value="role">Guardar rol</SubmitButton><SubmitButton className="secondary-button" name="operation" value="remove">Retirar acceso</SubmitButton></div></form>:<p className="helper-text">{member.role==='OWNER'?'Propietario protegido.':'Solo el propietario puede modificar este acceso.'}</p>}</article>)}</section>
    {session.role==='OWNER'?<InvitationForm/>:null}
    <article className="panel account-panel"><h2>Invitaciones recientes</h2>{!invitations.length?<p>No hay invitaciones todavía.</p>:invitations.map(invitation=>{const active=!invitation.accepted_at&&!invitation.revoked_at&&invitation.expires_at>new Date();return <div className="receipt-row" key={invitation.id}><div><strong>{invitation.email}</strong><p>{invitation.role} · {invitation.accepted_at?'Aceptada':invitation.revoked_at?'Retirada':active?'Pendiente':'Caducada'} · Caduca: {invitation.expires_at.toLocaleString('es-ES')}</p></div>{active&&session.role==='OWNER'?<form action={revokeInvitationAction}><input type="hidden" name="id" value={invitation.id}/><label>Tu contraseña para retirar esta invitación<input type="password" name="currentPassword" autoComplete="current-password" minLength={12} maxLength={200} required/></label><SubmitButton className="secondary-button">Retirar invitación</SubmitButton></form>:null}</div>;})}</article>
  </main>;
}


