import Link from 'next/link';
import {saveConnection,toggleConnection} from '@/app/engine-actions';
import {connectionSummaries,externalEnabled} from '@/lib/engines/connections';
import type {SessionClaims} from '@/lib/security/session';
import {can} from '@/lib/security/rbac';
import {SubmitButton} from './submit-button';
import {PageFeedback} from './page-feedback';

export async function ProviderSettings({session,query}:{session:SessionClaims;query:Record<string,string|undefined>}){
  const connections=await connectionSummaries(session.tenantId);const manage=can(session.role,'tenant:manage');
  return <main className="page-stack"><header className="page-heading"><div><p className="eyebrow">CONEXIONES</p><h1>Integraciones</h1><p>Configura los servicios que utilizará tu empresa.</p></div><Link className="secondary-button button-link" href="/ejecuciones">Ver ejecuciones</Link></header><PageFeedback error={query.error} success={query.guardado?'Configuración guardada. Las claves permanecen cifradas.':undefined}/><p className="secure-note">{externalEnabled()?'Los servicios externos están habilitados. Cada conexión y cada envío requieren su propia autorización.':'Preparación: las operaciones externas están desactivadas. Puedes guardar la configuración, pero no habrá envíos ni solicitudes de pago.'}</p>
    <section className="integration-grid">{(['resend','whatsapp','stripe','openai'] as const).map(provider=>{
      const saved=connections.find(row=>row.provider===provider);const names={resend:'Email · Resend',whatsapp:'WhatsApp Business',stripe:'Cobros · Stripe',openai:'Inteligencia artificial · OpenAI'};
      return <article className="panel provider-card" key={provider}><h2>{names[provider]}</h2><p><span className={`badge ${saved?.enabled?'success':'warning'}`}>{saved?(saved.enabled?'Configurada y habilitada':'Configurada y pausada'):'Sin configurar'}</span></p><p className="helper-text">{saved?'La disponibilidad en el proveedor se verificará al ejecutar una operación.':'Añade las credenciales de tu cuenta cuando la tengas.'}</p>{manage?<>
        {saved?<form action={toggleConnection}><input type="hidden" name="provider" value={provider}/><input type="hidden" name="enabled" value={String(!saved.enabled)}/><SubmitButton className="secondary-button">{saved.enabled?'Pausar conexión':'Habilitar conexión'}</SubmitButton></form>:null}
        <details><summary>{saved?'Sustituir credenciales':'Configurar'}</summary><form action={saveConnection} className="form-grid"><input type="hidden" name="provider" value={provider}/><label className="wide">Clave API<input type="password" name="apiKey" autoComplete="off" required minLength={10} maxLength={4000}/></label>
          {provider==='resend'?<><label className="wide">Remitente verificado<input type="email" name="from" required maxLength={200}/></label><label className="wide">Dirección de recepción (opcional)<input type="email" name="inboundAddress" maxLength={200}/></label><Secret name="webhookSecret" label="Secreto de firma de webhook"/></>:null}
          {provider==='stripe'?<Secret name="webhookSecret" label="Secreto de firma de webhook"/>:null}
          {provider==='whatsapp'?<><label>ID de teléfono<input name="phoneId" required pattern="[0-9]{5,40}"/></label><label>Versión Graph API<input name="graphVersion" placeholder="Versión vigente en Meta" required pattern="v[0-9]{1,3}\.0"/></label><Secret name="appSecret" label="Secreto de la app de Meta"/><Secret name="verifyToken" label="Token de verificación de webhook"/></>:null}
          {provider==='openai'?<><label className="wide">Modelo disponible en tu cuenta<input name="model" required maxLength={100}/></label><label>USD por millón de tokens de entrada<input type="number" name="inputPricePerMillion" min="0" max="1000" step="0.0001" required/></label><label>USD por millón de tokens de salida<input type="number" name="outputPricePerMillion" min="0" max="10000" step="0.0001" required/></label></>:null}
          <div className="form-footer wide"><SubmitButton>Guardar cifrado y pausar</SubmitButton></div></form></details>
        {provider!=='openai'?<p className="helper-text">Ruta de webhook:<br/><code>/api/webhooks/{session.tenantId}/{provider}</code></p>:null}
      </>:<p>El propietario administra las conexiones.</p>}</article>;
    })}</section><article className="panel secure-note">Google Calendar, Drive y otras fuentes todavía no están conectadas. Las autorizaciones de clientes se gestionan en <Link href="/permisos-contacto">Permisos de contacto</Link>.</article></main>;
}
function Secret({name,label}:{name:string;label:string}){return <label className="wide">{label}<input name={name} type="password" autoComplete="off" minLength={10} maxLength={4000} required/></label>;}
