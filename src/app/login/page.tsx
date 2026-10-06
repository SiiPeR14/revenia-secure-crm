import { LoginForm } from "@/components/login-form";

import {PageFeedback} from '@/components/page-feedback';



export default async function LoginPage({searchParams}:{searchParams:Promise<{cambiada?:string;demo?:string;plan?:string}>}) {

  const local=process.env.NODE_ENV!=='production';

  const query=await searchParams;
  const demoAccess=local||query.demo==='1';

  return (

    <main className="login-shell">

      <section className="login-brand">

        <div className="brand-mark brand-mark-large">R</div>

        <p className="eyebrow">REVENIA SECURE CRM</p>

        <h1>Convierte cada seguimiento en una nueva oportunidad.</h1>

        <p>Una plataforma segura para presupuestos, ventas y relaciones que merecen continuar.</p>

        <div className="trust-grid">

          <span>✓ Sesiones protegidas</span><span>✓ Aislamiento por empresa</span>

          <span>✓ Auditoría verificable</span><span>{local?'✓ Entorno local':'✓ Permisos por rol'}</span>

        </div>

      </section>

      <div><PageFeedback success={query.cambiada==='1'?'Contraseña cambiada. Todas las sesiones anteriores se han cerrado. Entra con tu nueva contraseña.':undefined}/><LoginForm demo={demoAccess?{email:'owner@revenia.local',password:'ReveniaDemo!2026',plan:query.plan}:undefined} /></div>

    </main>

  );

}

