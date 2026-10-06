export const invoices = [
  { id: "inv-1", tenantId: "11111111-1111-4111-8111-111111111111", number: "FAC-2026-001", customer: "Tecnobit", amount: 12500, status: "Pagada", issuedAt: "15/01/2026", dueAt: "14/02/2026", source: "Excel" },
  { id: "inv-2", tenantId: "11111111-1111-4111-8111-111111111111", number: "FAC-2026-002", customer: "BuildTech", amount: 8320, status: "Pendiente", issuedAt: "22/01/2026", dueAt: "21/02/2026", source: "Google Sheets" },
  { id: "inv-3", tenantId: "11111111-1111-4111-8111-111111111111", number: "FAC-2026-003", customer: "Solaris", amount: 25000, status: "Vencida", issuedAt: "05/02/2026", dueAt: "07/03/2026", source: "PDF importado" },
  { id: "inv-4", tenantId: "11111111-1111-4111-8111-111111111111", number: "FAC-2026-004", customer: "GreenTech", amount: 4750, status: "Pagada", issuedAt: "12/02/2026", dueAt: "12/03/2026", source: "OneDrive" },
  { id: "inv-5", tenantId: "11111111-1111-4111-8111-111111111111", number: "FAC-2026-005", customer: "Innova Retail", amount: 9680, status: "En revisión", issuedAt: "20/02/2026", dueAt: "21/03/2026", source: "CSV importado" },
  { id: "inv-6", tenantId: "22222222-2222-4222-8222-222222222222", number: "FAC-PRIVATE-001", customer: "Empresa B", amount: 999999, status: "Pendiente", issuedAt: "01/01/2026", dueAt: "01/02/2026", source: "Privado" },
] as const;

export const dashboard = { tenantId: "11111111-1111-4111-8111-111111111111", recommendations: [
  { action: "Contacta a", customer: "Laura Gómez", reason: "Su presupuesto de 12.400 € lleva 8 días sin respuesta.", priority: "Alta", channel: "WhatsApp", cta: "Enviar WhatsApp" },
  { action: "Llama a", customer: "Carlos Martínez", reason: "Mostró interés en la demo, pero no ha respondido.", priority: "Alta", channel: "Phone", cta: "Llamar ahora" },
  { action: "Envía seguimiento a", customer: "Marta Puig", reason: "Personaliza y envía el correo de seguimiento.", priority: "Media", channel: "Email", cta: "Enviar email" },
], conversations: [
  { initials: "LG", customer: "Laura Gómez", company: "Industrias Roca", channel: "WhatsApp", preview: "Hola Sergi, hemos revisado el presupuesto…" },
  { initials: "CM", customer: "Carlos Martínez", company: "BuildTech", channel: "Email", preview: "Gracias por la demo. ¿Podrías enviarme…" },
  { initials: "MP", customer: "Marta Puig", company: "Solaris", channel: "WhatsApp", preview: "Perfecto, quedo a la espera. ¡Gracias!" },
], automations: [
  { name: "Seguimiento automático de presupuestos", detail: "12 secuencias en curso" },
  { name: "Recuperación de oportunidades perdidas", detail: "8 flujos activos" },
  { name: "Recordatorios de seguimiento", detail: "24 reglas" },
] } as const;
