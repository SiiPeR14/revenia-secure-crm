'use client';

import {useState} from 'react';

const stages = [
  {name:'Detectar',title:'Cada factura, en su sitio.',detail:'Importe, cliente y vencimiento reunidos para decidir el siguiente paso.',status:'Pendiente',action:'Vencimiento identificado'},
  {name:'Preparar',title:'Un recordatorio con contexto.',detail:'Revisa el mensaje y la persona de contacto antes de autorizar cualquier envío.',status:'En revisión',action:'Borrador listo para revisar'},
  {name:'Comprobar',title:'Un cobro que queda registrado.',detail:'El escenario muestra cómo quedaría un pago confirmado. No se procesa ninguna transacción.',status:'Pagada',action:'Pago de ejemplo registrado'},
];

export function InvoiceShowcase(){
  const [stage,setStage]=useState(0);
  const current=stages[stage]!;
  return <div className="invoice-showcase" aria-label="Demostración ilustrativa de seguimiento de facturas">
    <div className="invoice-top"><span><i/> REVENIA / COBROS</span><small>SIMULACIÓN</small></div>
    <div className="invoice-overview"><div><span>Pendiente de cobro</span><strong>{stage===2?'9.250':'12.500'}<small>,00 €</small></strong></div><span className="invoice-period">Este mes ↗</span></div>
    <div className="invoice-chart" aria-hidden="true">{[26,38,33,54,48,65,60,80,73,94,88,100].map((height,i)=><span key={i} style={{height:`${height}%`}}/>)}</div>
    <div className="invoice-document"><div className="invoice-document-icon">↗</div><div><strong>Estudio Norte</strong><span>FAC-DEMO-024 · Servicios de diseño</span></div><b>3.250 €</b></div>
    <div className="invoice-state"><span className={`invoice-badge invoice-badge-${stage}`}>{current.status}</span><span>Datos ficticios · Sin envíos ni cobros</span></div>
    <div className="invoice-steps" role="group" aria-label="Pasos del ejemplo de facturas">{stages.map((item,i)=><button key={item.name} aria-pressed={stage===i} onClick={()=>setStage(i)}><span>{i+1}</span>{item.name}</button>)}</div>
    <div className="invoice-explanation" aria-live="polite"><strong>{current.title}</strong><p>{current.detail}</p><span>✓ {current.action}</span></div>
  </div>;
}

export function InvoiceServices(){
  const [volume,setVolume]=useState(80);
  const [minutes,setMinutes]=useState(6);
  return <section className="invoice-benefits mkt-container" id="facturas">
    <div><p className="mkt-eyebrow">MENOS ADMINISTRACIÓN. MÁS VISIBILIDAD.</p><h2>Tu trabajo termina.<br/>El seguimiento continúa.</h2><p>Una factura pendiente no debería convertirse en una cadena de notas, hojas de cálculo y correos sueltos.</p><a className="mkt-text-link" href="#demo">Explorar el producto <span aria-hidden="true">↗</span></a></div>
    <div className="invoice-benefit-list">
      <article><span>01</span><div><h3>Control de facturas y vencimientos</h3><p>Consulta qué está pendiente, pagado o vencido y conserva el contexto del cliente.</p><small>Gestión de facturas disponible en el CRM local.</small></div></article>
      <article><span>02</span><div><h3>Seguimiento de cobros</h3><p>El objetivo: preparar avisos oportunos y comprobar el pago sin perder el historial.</p><small>Reglas de vencimiento con tareas disponibles. Envíos y Stripe requieren validación real.</small></div></article>
      <article><span>03</span><div><h3>Presupuestos que vuelven a moverse</h3><p>Reglas de inactividad, tareas y borradores para retomar oportunidades que se han quedado paradas.</p><small>Motores implementados. Envíos externos pendientes de activación.</small></div></article>
    </div>
    <div className="invoice-time"><div><p className="mkt-eyebrow">PON CIFRAS AL TRABAJO MANUAL</p><h3>¿Cuánto tiempo dedicas al seguimiento?</h3><p>Estima la carga actual de tu equipo. No es una promesa de ahorro.</p></div><div className="invoice-inputs"><label>Facturas al mes<input type="number" min="1" max="10000" value={volume} onChange={e=>setVolume(Math.max(1,Math.min(10000,Math.trunc(Number(e.target.value)||1))))}/></label><label>Minutos por factura<input type="number" min="1" max="120" value={minutes} onChange={e=>setMinutes(Math.max(1,Math.min(120,Math.trunc(Number(e.target.value)||1))))}/></label></div><output aria-live="polite"><strong>{new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(volume*minutes/60)} h</strong><span>de trabajo manual / mes</span></output></div>
  </section>;
}
