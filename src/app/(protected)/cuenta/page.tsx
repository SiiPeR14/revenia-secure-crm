import {cookies} from 'next/headers';
import {requireSession} from '@/lib/auth/current-session';
import {accountOverview} from '@/lib/auth/account-service';
import {changePasswordAction,closeOtherSessionsAction,switchWorkspaceAction} from '@/app/account-actions';
import {PageFeedback} from '@/components/page-feedback';
import {SubmitButton} from '@/components/submit-button';

export default async function AccountPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  await requireSession();const token=(await cookies()).get('revenia_session')!.value;
  const [data,query]=await Promise.all([accountOverview(token),searchParams]);
  return <main className="page-stack"><header className="page-heading"><div><p className="eyebrow">SEGURIDAD PERSONAL</p><h1>Mi cuenta</h1><p>{data.profile?.display_name} · {data.profile?.email}</p></div></header>
    <PageFeedback error={query.error} success={query.guardado?'Las demás sesiones se han cerrado. Esta sesión sigue activa.':undefined}/>
    <article className="panel account-panel"><h2>Tus empresas</h2><p>Elige el espacio de trabajo. El cambio renueva la sesión y comprueba tus permisos en la empresa elegida.</p><form action={switchWorkspaceAction} className="form-grid"><label>Empresa<select name="tenantId" defaultValue={data.workspaces.find(item=>item.is_current)?.tenant_id}>{data.workspaces.map(item=><option key={item.tenant_id} value={item.tenant_id}>{item.tenant_name} · {item.role}</option>)}</select></label><div><SubmitButton>Cambiar de empresa</SubmitButton></div></form></article>
    <section className="account-grid">
      <article className="panel account-panel"><h2>Cambiar contraseña</h2><p>Al cambiarla se cerrarán todas tus sesiones y tendrás que volver a entrar.</p><form className="form-grid" action={changePasswordAction}>
        <label className="wide">Contraseña actual<input type="password" name="currentPassword" autoComplete="current-password" minLength={12} maxLength={200} required/></label>
        <label className="wide">Nueva contraseña<input type="password" name="newPassword" autoComplete="new-password" minLength={12} maxLength={200} required/></label>
        <label className="wide">Repetir nueva contraseña<input type="password" name="confirmation" autoComplete="new-password" minLength={12} maxLength={200} required/></label>
        <p className="helper-text wide">Utiliza una contraseña única de al menos 12 caracteres. Puedes usar una frase larga y un gestor de contraseñas.</p><div className="wide"><SubmitButton>Cambiar contraseña y cerrar sesiones</SubmitButton></div>
      </form></article>
      <article className="panel account-panel"><h2>Cerrar otras sesiones</h2><p>Cierra tus accesos en otros navegadores o dispositivos, también en otras empresas. La sesión que estás usando se conserva.</p><form className="form-grid" action={closeOtherSessionsAction}><label className="wide">Confirma tu contraseña actual<input type="password" name="currentPassword" autoComplete="current-password" minLength={12} maxLength={200} required/></label><div className="wide"><SubmitButton>Cerrar las demás sesiones</SubmitButton></div></form><p className="secure-note">La recuperación de contraseña y el segundo factor de autenticación todavía están pendientes. Conserva tus credenciales en un lugar seguro.</p></article>
    </section>
    <article className="panel account-panel table-scroll"><h2>Tus sesiones activas</h2><p>Se muestran hasta 100 sesiones, identificadas por empresa y fecha de creación. No se recopilan ubicaciones ni huellas del dispositivo.</p><table><thead><tr><th>Empresa</th><th>Rol</th><th>Inicio</th><th>Vencimiento</th><th>Sesión</th></tr></thead><tbody>{data.sessions.map(item=><tr key={item.id}><td>{item.tenant_name}</td><td>{item.role}</td><td>{item.created_at.toLocaleString('es-ES')}</td><td>{item.expires_at.toLocaleString('es-ES')}</td><td>{item.is_current?<span className="badge success">Esta sesión</span>:'Otra sesión'}</td></tr>)}</tbody></table></article>
  </main>;
}

