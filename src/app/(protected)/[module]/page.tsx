import Link from "next/link";
import { notFound } from "next/navigation";
import { acceptQuote, advanceOpportunity, completeTask, createClient, createOpportunity, createQuote, createTask } from "@/app/actions";
import { PageFeedback } from "@/components/page-feedback";
import { SubmitButton } from "@/components/submit-button";
import { requireSession } from "@/lib/auth/current-session";
import { getClientOptions, getWorkspaceRows, moduleDefinitions, type WorkspaceModule } from "@/lib/domain/workspace-service";

type Query = Record<string, string | string[] | undefined>;
const modules = new Set<WorkspaceModule>(["clientes", "oportunidades", "presupuestos", "tareas", "pagos"]);

function value(query: Query, key: string) { const item = query[key]; return Array.isArray(item) ? item[0] : item; }

export default async function WorkspacePage({ params, searchParams }: { params: Promise<{ module:string }>; searchParams: Promise<Query> }) {
  const [{ module }, query, session] = await Promise.all([params, searchParams, requireSession()]);
  if (!modules.has(module as WorkspaceModule)) notFound();
  const selectedModule = module as WorkspaceModule;
  const [rows, clients] = await Promise.all([
    getWorkspaceRows(session.tenantId, selectedModule),
    selectedModule === "oportunidades" || selectedModule === "presupuestos" || selectedModule === "tareas" ? getClientOptions(session.tenantId) : Promise.resolve([]),
  ]);
  const definition = moduleDefinitions[selectedModule];
  const selected = rows.find((row) => row.id === value(query, "detalle"));
  const showCreate = value(query, "nuevo") === "1" && selectedModule !== "pagos";

  return <main className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">{definition.eyebrow}</p><h1>{definition.title}</h1><p>{definition.description}</p></div><Link className="primary-button button-link" href={definition.actionHref}>{definition.action}</Link></header>
    <PageFeedback success={value(query,"recomendada") ? "Tarea de seguimiento creada." : value(query,"creado") ? "Guardado correctamente y registrado en la auditoría." : value(query,"actualizado") ? "Estado actualizado correctamente." : undefined} error={value(query,"error")} />
    <article className="panel data-panel">
      <div className="panel-toolbar"><strong>{rows.length} registros</strong><span>Datos aislados para NovaTech Solutions</span></div>
      <div className="table-scroll"><table><thead><tr>{definition.columns.map((column) => <th key={column}>{column}</th>)}<th>Acciones</th></tr></thead><tbody>
        {rows.map((row) => <tr key={row.id}>{row.cells.map((cell,index) => <td key={`${row.id}-${definition.columns[index]}`} className={index === 0 ? "strong-cell" : undefined}>{cell}</td>)}<td><div className="row-actions"><Link className="table-action" href={`/${selectedModule}?detalle=${row.id}`}>Ver</Link>{selectedModule === "tareas" && row.status !== "Completada" ? <form action={completeTask}><input type="hidden" name="id" value={row.id}/><SubmitButton className="table-action success" pendingText="…">Completar</SubmitButton></form> : null}{selectedModule === "oportunidades" && row.status !== "Ganada" && row.status !== "Perdida" ? <form action={advanceOpportunity}><input type="hidden" name="id" value={row.id}/><SubmitButton className="table-action" pendingText="…">Avanzar</SubmitButton></form> : null}{selectedModule === "presupuestos" && row.status !== "Aceptado" ? <form action={acceptQuote}><input type="hidden" name="id" value={row.id}/><SubmitButton className="table-action success" pendingText="…">Aceptar</SubmitButton></form> : null}</div></td></tr>)}
        {!rows.length ? <tr><td colSpan={definition.columns.length + 1}><div className="empty-state"><strong>Todavía no hay registros</strong><span>Usa la acción principal para crear el primero.</span></div></td></tr> : null}
      </tbody></table></div>
    </article>
    {showCreate ? <CreateModal module={selectedModule} clients={clients} /> : null}
    {selected ? <DetailDrawer module={selectedModule} columns={definition.columns} row={selected} /> : null}
  </main>;
}

function CreateModal({ module, clients }: { module:WorkspaceModule; clients:{id:string;name:string}[] }) {
  const today = new Date().toISOString().slice(0,10);
  const commonClient = <label>Cliente<select name="clientId" defaultValue=""><option value="">Sin cliente asociado</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>;
  return <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><p className="eyebrow">NUEVO REGISTRO</p><h2 id="modal-title">{moduleDefinitions[module].action}</h2></div><Link href={`/${module}`} className="icon-button" aria-label="Cerrar">×</Link></div>
    {module === "clientes" ? <form action={createClient} className="form-grid"><label>Nombre<input name="name" minLength={2} maxLength={120} required autoFocus/></label><label>Empresa<input name="company" minLength={2} maxLength={160} required/></label><label>Correo<input name="email" type="email" maxLength={200} required/></label><label>Teléfono<input name="phone" type="tel" maxLength={40}/></label><label>Valor potencial<input name="value" inputMode="decimal" pattern="\d{1,11}([.,]\d{1,2})?" defaultValue="0" required/></label><FormFooter module={module}/></form> : null}
    {module === "oportunidades" ? <form action={createOpportunity} className="form-grid"><label className="wide">Título<input name="title" minLength={2} maxLength={160} required autoFocus/></label>{commonClient}<label>Etapa<select name="stage" defaultValue="Prospección"><option>Prospección</option><option>Calificación</option><option>Propuesta</option><option>Negociación</option></select></label><label>Importe<input name="amount" inputMode="decimal" pattern="\d{1,11}([.,]\d{1,2})?" required/></label><label>Probabilidad<input name="probability" type="number" min="0" max="100" defaultValue="30" required/></label><FormFooter module={module}/></form> : null}
    {module === "presupuestos" ? <form action={createQuote} className="form-grid"><label>Número<input name="number" minLength={1} maxLength={50} required autoFocus/></label>{commonClient}<label>Importe<input name="amount" inputMode="decimal" pattern="\d{1,11}([.,]\d{1,2})?" required/></label><label>Estado<select name="status" defaultValue="Borrador"><option>Borrador</option><option>Enviado</option><option>Visto</option><option>Seguimiento</option></select></label><label>Emisión<input name="issuedAt" type="date" defaultValue={today} required/></label><label>Caducidad<input name="expiresAt" type="date" defaultValue={today} required/></label><FormFooter module={module}/></form> : null}
    {module === "tareas" ? <form action={createTask} className="form-grid"><label className="wide">Tarea<input name="title" minLength={2} maxLength={200} required autoFocus/></label>{commonClient}<label>Canal<select name="channel" defaultValue="Tarea"><option>Tarea</option><option>Llamada</option><option>Email</option><option>WhatsApp</option></select></label><label>Vencimiento<input name="dueAt" type="datetime-local" required/></label><FormFooter module={module}/></form> : null}
  </section></div>;
}

function FormFooter({ module }: { module:WorkspaceModule }) { return <div className="form-footer wide"><Link href={`/${module}`} className="secondary-button button-link">Cancelar</Link><SubmitButton>Guardar</SubmitButton></div>; }

function DetailDrawer({ module, columns, row }: { module:WorkspaceModule; columns:readonly string[]; row:{id:string;cells:string[];invoiceId?:string|null} }) {
  return <div className="modal-backdrop"><aside className="detail-drawer" aria-label="Detalle del registro"><div className="modal-heading"><div><p className="eyebrow">DETALLE</p><h2>{row.cells[0]}</h2></div><Link href={`/${module}`} className="icon-button" aria-label="Cerrar">×</Link></div><dl>{columns.map((column,index) => <div key={column}><dt>{column}</dt><dd>{row.cells[index]}</dd></div>)}</dl>{row.invoiceId?<Link className="primary-button button-link" href={`/facturas?detalle=${row.invoiceId}`}>Abrir factura vinculada</Link>:null}<div className="secure-note">✓ Acceso validado para tu empresa y registrado de forma segura.</div></aside></div>;
}
