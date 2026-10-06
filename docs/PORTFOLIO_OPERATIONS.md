# Operación y demo de Revenia

## Arranque local
Node 24 y Docker. Copiar .env.example a .env.local solo en un entorno nuevo: no sobrescribir secretos existentes. Ejecutar docker compose up -d, npm ci, npm run db:migrate y npm run db:seed. El seed existente conserva registros. npm run dev abre http://localhost:3000; npm run worker:local procesa reglas. Las claves de ejemplo son exclusivamente locales.

## Tres recorridos de demostración
1. /clientes: crear y editar; desde otra pestaña comprobar conflicto de versión. Archivar y verificar que una tarea vinculada se conserva.
2. /seguridad: ejecutar comprobación; revisar alcance, fecha, resultados «sin evaluar» e informe JSON. /laboratorio documenta las reproducciones separadas.
3. /recuperar-acceso: solicitar con un usuario local. npm run recovery:mail:local entrega hasta 20 solicitudes en Mailpit (http://localhost:8025). Abrir enlace, cambiar contraseña y verificar revocación de la sesión anterior.

Nunca mostrar credenciales, cookies o tokens en capturas públicas. Para la demo pública usar una instalación distinta con datos sintéticos y permisos restringidos.

## API y diagnóstico
/api-docs y /api/v1/openapi exigen sesión. REST de clientes/tareas: 120 peticiones/minuto por usuario y empresa, JSON <=16 KiB, paginación <=100. Mutaciones con Origin exacto de APP_URL. 409 significa edición obsoleta: recargar, revisar y reintentar. La API usa dinero decimal en strings.

Scanner: tres ejecuciones/minuto por empresa, una en curso, timeout de sonda y sin destinos arbitrarios. Control no observado: no evaluado. El informe JSON muestra hasta 20 ejecuciones y 100 hallazgos.

Vida: /api/live. Disponibilidad: /api/health (200 o 503). Métricas: /api/v1/metrics, solo administración. Logs: identificador de petición para correlacionar errores. No usar estos contadores por proceso como una promesa de disponibilidad global.

Propuesta de alertas de producción, todavía no activadas: disponibilidad fallida tres veces seguidas; errores 5xx >5% en cinco minutos con volumen mínimo de 20; worker sin heartbeat >2 minutos; outbox con fallo permanente; backup fuera de ventana. Ajustar umbrales con tráfico real.

## Correo de recuperación
El script local entrega en Mailpit y rechaza NODE_ENV=production. El worker general admite RECOVERY_MAIL_PROVIDER=mailpit en local, o resend con RECOVERY_RESEND_API_KEY, RECOVERY_FROM y EXTERNAL_OPERATIONS_ENABLED=true. Resend debe tener remitente verificado. No se configuraron ni activaron credenciales reales.

La outbox reintenta hasta tres veces; mensajes consumidos o vencidos no deben enviarse. Payloads terminales se eliminan; expirados se limpian al reclamar trabajos. Supervisar el worker: aceptar una petición no prueba que el correo haya llegado. Ensayar entrega, reintento, baja y recuperación con la cuenta sandbox antes de activar.

## Backup y restauración
npm run ops:restore-drill solo acepta la base local Revenia en puerto 54329. Crea snapshot consistente, dump bajo .revenia/backups y base temporal aleatoria. Restaura allí, compara recuentos, verifica RLS y auditoría y elimina únicamente la base temporal. El dump contiene datos sensibles: mantener fuera de Git, imágenes y enlaces públicos.

Ensayo observado: 2026-10-06, unos 2 segundos en esta máquina, 6 clientes, 7 facturas, 22 eventos y 2 empresas; recuentos e integridad comprobados. Ese tiempo no es un RTO de producción. No hay copia externa ni retención automática configurada. Antes de publicar: definir RPO/RTO, cifrado externo, custodia de claves, retención y restauración con permisos mínimos.

## Migraciones y rollback
018 añade columnas/versiones/archivo y tablas de seguridad. 019 añade identidad global de recuperación y funciones estrechas. Copiar antes de migrar, ensayar en staging y no ejecutar un down destructivo para volver de versión. Restaurar la versión de aplicación previa solo tras revisar compatibilidad; las columnas/tablas añadidas pueden permanecer. Si hay datos dañados, restaurar en una base nueva y validar antes de conmutar.

## Entrega
npm run test:all:docker, test:portfolio, test:lab, test:ops y test:e2e. Ejecutar ops:restore-drill cuando cambie la recuperación. CI incluye estos controles. CodeQL necesita un repositorio con code scanning disponible. La carpeta actual no tiene remoto: workflows preparados, ejecución remota pendiente.

## Incidencia de Docker resuelta
Docker Desktop 4.89.0 fallaba antes de levantar Linux por sailor-ingest.sock inaccesible (Windows 1920). Con el backend detenido se apartó reversiblemente solo la carpeta temporal run a run.revenia-repair-20261006 y se creó una nueva. Motor 29.7.2 y servicios de Revenia volvieron a responder. No se hizo factory reset ni se modificó el disco de datos. Se conserva la carpeta temporal anterior; no borrarla mediante limpiezas recursivas improvisadas.
