import {AcceptInvitationForm} from '@/components/accept-invitation-form';
export const metadata={title:'Aceptar invitación · Revenia',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default function InvitationPage(){return <main className="login-shell"><section className="login-brand"><div className="brand-mark brand-mark-large">R</div><p className="eyebrow">REVENIA</p><h2>Un espacio para trabajar juntos.</h2><p>Accede con los permisos que te haya asignado el propietario de tu empresa.</p></section><AcceptInvitationForm/></main>;}
