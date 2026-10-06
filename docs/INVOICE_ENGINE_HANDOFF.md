# Seguimiento real de facturas — 10 septiembre 2026

Migración 016 aplicada. Nuevo activador invoice_overdue configurable en Automatizaciones con plazo de 1–365 días después del vencimiento, según fecha UTC. Reutiliza la cola persistente, reservas de uso, autorización y auditoría existentes; no crea un proceso PowerShell de negocio paralelo.

Selecciona facturas Pendiente/Vencida con importe positivo. Crea una tarea y notificación, nunca envía correos, WhatsApp ni inicia cobros por sí mismo. Deduplicación por regla, factura y revisión updated_at; una modificación posterior puede generar otra revisión. Antes de crear la tarea bloquea y revalida regla y factura: pago, cancelación, aplazamiento o cambio de revisión impiden ejecutar el trabajo antiguo. Las tareas ya creadas permanecen para revisión humana; no se cierran automáticamente cuando se paga una factura.

Las tareas incluyen invoice_id con clave foránea compuesta por empresa. La vista muestra el cliente de la factura y permite abrirla desde el detalle. No se relacionan contactos por coincidencia de nombre: las facturas actuales guardan customer como texto, por lo que no se infiere un email ni un destinatario para enviar avisos.

Regla activada en NovaTech Solutions: «Revisar cobro 3 días después del vencimiento». El worker actualizado creó dos tareas reales locales, para FAC-2026-002 y FAC-2026-003. Verificado en navegador el recorrido regla → tarea → detalle de factura. No se han completado tareas del usuario ni modificado estados de facturas durante esa comprobación.

Validación: 120 pruebas superadas (108 anteriores, 7 nuevas de facturas y 5 de empaquetado), tipos, lint y build. Los casos nuevos cubren concurrencia, umbral de fecha, estados excluidos, importes cero, pago/cancelación antes de ejecutar, cambios de revisión, pausa y aislamiento. Fixtures de pruebas eliminadas al terminar; tareas de la regla local conservadas. Worker reiniciado y observado funcionando.

Versión local preparada: releases/revenia-2026-09-10T16-42-59-325Z-792e9385f3. No publicada. Sustituye a la copia anterior para esta revisión.

## Trabajo que sigue pendiente

- Avisos de factura: asociar explícitamente factura y contacto, generar borrador contextual y revalidar cobro/consentimiento también antes del envío. No reutilizar directamente un mensaje sin ese vínculo.
- Cuentas reales y pruebas sandbox de email, Meta, Stripe e IA; continúan apagadas.
- Alta inicial segura, recuperación de cuenta y MFA.
- Orquestación persistente de contratación y portal de suscripciones.
- Exportación/borrado/retención de datos, backups cifrados y restauración ensayada.
- Construcción de imagen, staging, alertas, revisión independiente y validación legal antes del lanzamiento.

Este hito completa el motor local de tareas por vencimiento, no todos los requisitos de lanzamiento. Consultar RELEASE_READINESS.md antes de cualquier activación externa.
