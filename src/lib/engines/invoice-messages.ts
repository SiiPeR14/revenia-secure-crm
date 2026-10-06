import type {TenantDatabase} from '../db/tenant-transaction.ts';
import {EngineError} from './contracts.ts';
import {recordAudit} from '../db/audit-repository.ts';

export async function prepareInvoiceMessage(db:TenantDatabase,session:{tenantId:string;userId:string},invoiceId:string,clientId:string){
  const invoice=(await db.query<{number:string;amount:string;currency:string;due:string;updated_at:Date}>("SELECT number,amount,currency,due_at::text due,updated_at FROM invoices WHERE id=$1 AND status IN ('Pendiente','Vencida') AND amount>0 FOR SHARE",[invoiceId])).rows[0];
  if(!invoice)throw new EngineError('INVOICE_NOT_PAYABLE');
  const client=(await db.query<{name:string;email:string}>('SELECT name,email FROM clients WHERE id=$1 FOR SHARE',[clientId])).rows[0];
  if(!client)throw new EngineError('CONTACT_PERMISSION_MISSING');
  const subject=`Seguimiento de factura ${invoice.number}`;
  const amount=new Intl.NumberFormat('es-ES',{style:'currency',currency:invoice.currency}).format(Number(invoice.amount));
  const body=`Hola, ${client.name}.\n\nTe contactamos por la factura ${invoice.number}, por ${amount}, con vencimiento ${invoice.due}. En nuestros registros figura pendiente. ¿Podrías confirmarnos su estado? Si ya has realizado el pago, indícanoslo para revisarlo.\n\nGracias.`;
  const result=await db.query<{id:string}>("INSERT INTO conversations(tenant_id,client_id,channel,direction,body,subject,delivery_status,invoice_id,invoice_updated_at) VALUES($1,$2,'Email','Salida',$3,$4,'draft',$5,$6) ON CONFLICT DO NOTHING RETURNING id",[session.tenantId,clientId,body,subject,invoiceId,invoice.updated_at]);
  if(result.rows[0])await recordAudit(db,session,'invoice.draft_prepared','invoice',invoiceId);
  return result.rows[0]?.id;
}

export async function checkInvoiceMessage(db:TenantDatabase,conversationId:string,clientId:string){
  const message=(await db.query<{invoice_id:string|null;invoice_updated_at:Date|null;client_id:string}>("SELECT invoice_id,invoice_updated_at,client_id FROM conversations WHERE id=$1",[conversationId])).rows[0];
  if(!message?.invoice_id)return;
  const invoice=(await db.query<{updated_at:Date}>("SELECT updated_at FROM invoices WHERE id=$1 AND status IN ('Pendiente','Vencida') AND amount>0 FOR SHARE",[message.invoice_id])).rows[0];
  if(!invoice||message.client_id!==clientId||invoice.updated_at.toISOString()!==message.invoice_updated_at?.toISOString())throw new EngineError('INVOICE_NOTICE_STALE');
}
