# Avisos de factura — punto de continuación, 11 septiembre 2026

Implementación guardada, pendiente de migración y verificación con PostgreSQL. No presentar este hito como terminado.

Añadidos: migración 017 (vínculo entre conversación y factura, revisión y deduplicación); preparación explícita de borrador de email desde detalle de factura seleccionando un contacto y confirmando la relación; comprobación de factura pendiente/importe positivo/revisión antes de aprobar y antes de reservar el envío. La creación del borrador no exige ni concede permiso de envío. La aprobación conserva permiso de contacto, supresión, proveedor y activación externa existentes.

Las facturas no se asocian automáticamente por nombres. El destinatario queda en el borrador. No se envía ni se cobra al prepararlo. Un cambio de revisión invalida el aviso y requiere otro borrador. La comprobación antes de despacho no puede cancelar una petición ya aceptada por un proveedor. El texto preparado no incluye enlaces de pago.

Pruebas añadidas a invoices.integration.test.ts: deduplicación sin trabajo de envío, invalidación por pago/destinatario y cambio de revisión/contacto inexistente. Aún NO ejecutadas: PostgreSQL rechazó conexión a localhost:54329. Tipos, lint y build pasaron antes de los últimos ajustes de mensajes de error y comprobación de migración.

Docker Desktop está en C:/Users/sergi/AppData/Local/Programs/DockerDesktop/Docker Desktop.exe. Se inició su proceso, pero el pipe dockerDesktopLinuxEngine sigue inexistente. wsl --status devuelve E_ACCESSDENIED en esta sesión. Se pidió al usuario el mensaje de la ventana. No se modificaron flags externos ni configuraciones de WSL.

Continuar: resolver arranque del motor Docker, docker compose up -d, npm run db:migrate, npm run ops:verify, probar formulario → borrador en Inbox y bloqueo de envío sin proveedores; corregir fallos, reiniciar worker y preparar nueva versión. Las copias de releases anteriores NO incluyen estos cambios. La migración 017 debe aplicarse antes de usar los avisos o reiniciar el worker actualizado.

Pendientes posteriores: asociación gestionable de factura/contacto, avisos WhatsApp contextualizados, alta/recuperación/MFA, contratación persistente, privacidad operativa y backups/restauración, validaciones reales y lanzamiento. No se ha publicado nada.
