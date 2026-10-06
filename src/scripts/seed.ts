import pg from "pg";
import { hashPassword } from "../lib/security/password.ts";

if(process.env.NODE_ENV==='production'||process.env.DEPLOYMENT_ENV==='production')throw new Error('Los datos de demostración están bloqueados en producción.');

const { Client } = pg;
const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error("MIGRATION_DATABASE_URL no está configurado");

const NOVATECH = "11111111-1111-4111-8111-111111111111";
const RIVAL = "22222222-2222-4222-8222-222222222222";
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const passwordHash = await hashPassword(process.env.DEV_OWNER_PASSWORD ?? "ReveniaDemo!2026");
const client = new Client({ connectionString, application_name: "revenia-seed" });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("INSERT INTO tenants(id,slug,name) VALUES ($1,'novatech','NovaTech Solutions'),($2,'rival','Rival Demo') ON CONFLICT (id) DO NOTHING", [NOVATECH, RIVAL]);
  await client.query("INSERT INTO users(id,email,display_name,password_hash) VALUES ($1,$2,'Sergi', $3) ON CONFLICT (id) DO NOTHING", [OWNER, (process.env.DEV_OWNER_EMAIL ?? "owner@revenia.local").toLowerCase(), passwordHash]);
  await client.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES ($1,$2,'OWNER') ON CONFLICT (tenant_id,user_id) DO NOTHING", [NOVATECH, OWNER]);
  const invoices = [
    ["10000000-0000-4000-8000-000000000001", NOVATECH, "FAC-2026-001", "Tecnobit", 12500, "Pagada", "2026-01-15", "2026-02-14", "Excel"],
    ["10000000-0000-4000-8000-000000000002", NOVATECH, "FAC-2026-002", "BuildTech", 8320, "Pendiente", "2026-01-22", "2026-02-21", "Google Sheets"],
    ["10000000-0000-4000-8000-000000000003", NOVATECH, "FAC-2026-003", "Solaris", 25000, "Vencida", "2026-02-05", "2026-03-07", "PDF importado"],
    ["10000000-0000-4000-8000-000000000004", NOVATECH, "FAC-2026-004", "GreenTech", 4750, "Pagada", "2026-02-12", "2026-03-12", "OneDrive"],
    ["10000000-0000-4000-8000-000000000005", NOVATECH, "FAC-2026-005", "Innova Retail", 9680, "En revisión", "2026-02-20", "2026-03-21", "CSV importado"],
    ["20000000-0000-4000-8000-000000000001", RIVAL, "FAC-PRIVATE-001", "Empresa B", 999999, "Pendiente", "2026-01-01", "2026-02-01", "Privado"],
  ];
  for (const invoice of invoices) {
    await client.query("INSERT INTO invoices(id,tenant_id,number,customer,amount,status,issued_at,due_at,source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING", invoice);
  }

  await client.query(`
    INSERT INTO clients(id,tenant_id,name,company,email,phone,status,value) VALUES
      ('30000000-0000-4000-8000-000000000001',$1,'Laura Gómez','Industrias Roca','laura@industrias-roca.test','+34 612 345 678','Potencial',12400),
      ('30000000-0000-4000-8000-000000000002',$1,'Carlos Martínez','BuildTech','carlos@buildtech.test','+34 623 456 789','Activo',21500),
      ('30000000-0000-4000-8000-000000000003',$1,'Marta Puig','Solaris','marta@solaris.test','+34 634 567 890','Activo',25000),
      ('30000000-0000-4000-8000-000000000004',$1,'Álex Torres','GreenTech','alex@greentech.test','+34 645 678 901','Potencial',4750)
    ON CONFLICT (id) DO NOTHING
  `, [NOVATECH]);
  await client.query("INSERT INTO clients(id,tenant_id,name,company,email,phone,status,value) VALUES ('39999999-0000-4000-8000-000000000001',$1,'Cliente privado','Empresa B','private@rival.test','','Activo',999999) ON CONFLICT (id) DO NOTHING", [RIVAL]);

  await client.query(`
    INSERT INTO opportunities(id,tenant_id,client_id,title,stage,amount,probability,next_action_at) VALUES
      ('40000000-0000-4000-8000-000000000001',$1,'30000000-0000-4000-8000-000000000001','Renovación anual Industrias Roca','Propuesta',12400,78,now()+interval '4 hours'),
      ('40000000-0000-4000-8000-000000000002',$1,'30000000-0000-4000-8000-000000000002','Implantación BuildTech','Negociación',21500,66,now()+interval '1 day'),
      ('40000000-0000-4000-8000-000000000003',$1,'30000000-0000-4000-8000-000000000003','Expansión Solaris','Calificación',25000,52,now()+interval '2 days'),
      ('40000000-0000-4000-8000-000000000004',$1,'30000000-0000-4000-8000-000000000004','Piloto GreenTech','Prospección',4750,35,now()+interval '3 days')
    ON CONFLICT (id) DO NOTHING
  `, [NOVATECH]);

  await client.query(`
    INSERT INTO quotes(id,tenant_id,client_id,number,amount,status,issued_at,expires_at) VALUES
      ('50000000-0000-4000-8000-000000000001',$1,'30000000-0000-4000-8000-000000000001','P-2026-028',12500,'Enviado','2026-08-30','2026-09-30'),
      ('50000000-0000-4000-8000-000000000002',$1,'30000000-0000-4000-8000-000000000002','P-2026-027',18000,'Seguimiento','2026-08-25','2026-09-25'),
      ('50000000-0000-4000-8000-000000000003',$1,'30000000-0000-4000-8000-000000000003','P-2026-026',25000,'Visto','2026-08-20','2026-09-20')
    ON CONFLICT (id) DO NOTHING
  `, [NOVATECH]);

  await client.query(`
    INSERT INTO tasks(id,tenant_id,client_id,title,channel,status,due_at) VALUES
      ('60000000-0000-4000-8000-000000000001',$1,'30000000-0000-4000-8000-000000000001','Llamar a Laura Gómez','Llamada','Pendiente',now()+interval '2 hours'),
      ('60000000-0000-4000-8000-000000000002',$1,'30000000-0000-4000-8000-000000000002','Enviar seguimiento a BuildTech','WhatsApp','Pendiente',now()+interval '4 hours'),
      ('60000000-0000-4000-8000-000000000003',$1,'30000000-0000-4000-8000-000000000003','Revisar presupuesto Solaris','Tarea','Pendiente',now()+interval '1 day')
    ON CONFLICT (id) DO NOTHING
  `, [NOVATECH]);

  await client.query(`
    INSERT INTO conversations(id,tenant_id,client_id,channel,direction,body,read_at,created_at) VALUES
      ('70000000-0000-4000-8000-000000000001',$1,'30000000-0000-4000-8000-000000000001','WhatsApp','Entrada','Hola Sergi, hemos revisado el presupuesto y nos parece muy bien.',NULL,now()-interval '20 minutes'),
      ('70000000-0000-4000-8000-000000000002',$1,'30000000-0000-4000-8000-000000000002','Email','Entrada','Gracias por la demo. ¿Podrías enviarme el plan de implantación?',NULL,now()-interval '1 day'),
      ('70000000-0000-4000-8000-000000000003',$1,'30000000-0000-4000-8000-000000000003','WhatsApp','Salida','Perfecto, quedo a la espera. ¡Gracias!',now(),now()-interval '2 days')
    ON CONFLICT (id) DO NOTHING
  `, [NOVATECH]);

  await client.query(`
    INSERT INTO automations(id,tenant_id,name,trigger_name,enabled,executions) VALUES
      ('80000000-0000-4000-8000-000000000001',$1,'Seguimiento automático de presupuestos','Al enviar presupuesto',true,12),
      ('80000000-0000-4000-8000-000000000002',$1,'Recuperación de oportunidades perdidas','Oportunidad sin respuesta',true,8),
      ('80000000-0000-4000-8000-000000000003',$1,'Recordatorios de seguimiento','24 horas antes de vencer',true,24),
      ('80000000-0000-4000-8000-000000000004',$1,'Solicitud de reseñas','Venta cerrada',false,3)
    ON CONFLICT (id) DO NOTHING
  `, [NOVATECH]);

  await client.query(`
    INSERT INTO integrations(id,tenant_id,provider,status,last_synced_at) VALUES
      ('90000000-0000-4000-8000-000000000001',$1,'WhatsApp Business','Conectado',now()-interval '10 minutes'),
      ('90000000-0000-4000-8000-000000000002',$1,'Email','Conectado',now()-interval '5 minutes'),
      ('90000000-0000-4000-8000-000000000003',$1,'Stripe','Disponible',NULL),
      ('90000000-0000-4000-8000-000000000004',$1,'Google Calendar','Disponible',NULL),
      ('90000000-0000-4000-8000-000000000005',$1,'Google Drive','Disponible',NULL)
    ON CONFLICT (id) DO NOTHING
  `, [NOVATECH]);

  await client.query(`
    INSERT INTO payments(id,tenant_id,invoice_id,reference,amount,status,paid_at) VALUES
      ('a0000000-0000-4000-8000-000000000001',$1,'10000000-0000-4000-8000-000000000001','PAY-2026-001',12500,'Completado',now()-interval '2 days'),
      ('a0000000-0000-4000-8000-000000000002',$1,'10000000-0000-4000-8000-000000000002','PAY-2026-002',8320,'Pendiente',NULL)
    ON CONFLICT (id) DO NOTHING
  `, [NOVATECH]);

  await client.query(`
    INSERT INTO notifications(id,tenant_id,title,detail,href,read_at,created_at) VALUES
      ('b0000000-0000-4000-8000-000000000001',$1,'Presupuesto visto','Laura Gómez ha abierto P-2026-028.','/presupuestos',NULL,now()-interval '15 minutes'),
      ('b0000000-0000-4000-8000-000000000002',$1,'Seguimiento recomendado','BuildTech lleva 3 días sin responder.','/recovery',NULL,now()-interval '2 hours'),
      ('b0000000-0000-4000-8000-000000000003',$1,'Pago recibido','Se ha registrado el pago PAY-2026-001.','/pagos',now(),now()-interval '2 days')
    ON CONFLICT (id) DO NOTHING
  `, [NOVATECH]);
  await client.query("INSERT INTO tenant_preferences(tenant_id,timezone,locale,currency,email_notifications,weekly_digest) VALUES ($1,'Europe/Madrid','es-ES','EUR',true,true) ON CONFLICT (tenant_id) DO NOTHING", [NOVATECH]);
  await client.query("COMMIT");
  console.log("[DATABASE] Development data ready");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
