# Verificación del entorno local

Verificación realizada el 9 de septiembre de 2026 sobre la aplicación local.

## Comprobaciones automatizadas

- `npm run test:all:docker`: TypeScript, ESLint, nueve pruebas unitarias, compilación y siete pruebas de integración PostgreSQL/Redis aprobadas.
- `npm audit --omit=dev`: ninguna vulnerabilidad conocida en las dependencias de producción en esta comprobación.
- `node --env-file=.env.local --experimental-transform-types src/scripts/check-http.ts`: acceso anónimo rechazado, origen externo bloqueado, inicio de sesión, atributos de cookie, acceso autorizado y revocación efectiva. Reutilizar una cookie cerrada devuelve al login.
- `check-seed-preservation.ts`: huellas de las 14 tablas iguales antes y después de ejecutar `npm run db:seed`. La carga de ejemplo no sobrescribe registros existentes.

## Comprobaciones en navegador

Las 15 rutas del menú principal cargan contenido sin errores de consola. Se verificó el inicio de sesión, las notificaciones y mensajes marcados como leídos con actualización de sus contadores, y la búsqueda de Arquitectura con resultados de cliente y factura.

La sesión anterior comprobó creación de cliente, creación y finalización de tarea recomendada, importación CSV, guardado de preferencias y activación/desactivación de una simulación de integración.

## Límites de la evidencia

Estas comprobaciones validan los flujos indicados en el entorno local. No equivalen a una auditoría independiente, una prueba de carga, certificación de cumplimiento ni validación de todas las combinaciones posibles de formularios y permisos. La utilidad de cifrado y la cadena de auditoría tienen pruebas unitarias; falta integrar cifrado de campos reales y un verificador persistente de la cadena.

Para comprobar la conservación de datos sin imprimir información sensible:

```powershell
node --env-file=.env.local --experimental-transform-types src/scripts/check-seed-preservation.ts capture ../../work/seed-state.json
npm run db:seed
node --env-file=.env.local --experimental-transform-types src/scripts/check-seed-preservation.ts compare ../../work/seed-state.json
```

## Verificación de motores — 9 de septiembre de 2026

La comprobación completa actual incluye 47 pruebas: 11 unitarias, 8 PostgreSQL/Redis y 28 de motores. También pasan TypeScript, ESLint y compilación Next.js.

Se comprobaron firmas Stripe/Svix/Meta y límite de cuerpo; una sola tarea por versión y lease; avance sobre 105 presupuestos; reglas pausadas y origen con actividad nueva; permisos, rol, destinatario, bajas y credenciales cambiados antes del envío; procesamiento simultáneo del mismo trabajo; interrupción sin reenvío; pagos con importes incorrectos, duplicados y expiraciones tardías; recepción WhatsApp deduplicada y supresión por BAJA; espera y revisión de avisos sin correspondencia.

Redis se probó con 20 peticiones simultáneas en modo producción: comparten la misma conexión. La comprobación de despliegue rechaza la configuración local y no imprime secretos. El worker arranca, se detiene ordenadamente, reinicia y registra actividad reciente. Las pruebas HTTP de autenticación y revocación vuelven a pasar.

En navegador: regla «Seguimiento de presupuestos tras 3 días» creada y persistida; botón de procesamiento local operativo; pantallas Integraciones, Ejecuciones e Intelligence comprobadas; solicitud IA rechazada con el aviso de servicios externos apagados. No se forzaron fechas de datos reales para generar tareas. Un error transitorio anterior a la migración 005 aparece en el historial de consola; esa migración ya está aplicada.

Las 28 pruebas de motores son simuladas para HTTP y reales para PostgreSQL. No certifican compatibilidad de cuentas, entrega externa, cobro real, modelos disponibles ni cumplimiento legal. La imagen Docker de producción todavía no se ha construido/ejecutado. La verificación positiva de despliegue requiere infraestructura y configuración reales.
El HTML compilado del login de producción se ha comprobado sin usuario ni contraseña de demostración. Permisos de contacto, Facturas y Ejecuciones se han revisado en el navegador tras la compilación.

## Bloque de cuentas y auditoría

La comprobación completa pasa ahora 78 pruebas: 12 unitarias, 8 PostgreSQL/Redis, 28 motores, 21 cuentas/invitaciones/empresas y 9 de auditoría persistente. TypeScript, ESLint y build pasan. Las nuevas migraciones 007–011 están aplicadas.

En navegador, con una empresa temporal separada: creación de invitación, rechazo de contraseñas diferentes, corrección sin perder el token, aceptación y login del nuevo usuario VIEWER. Equipo y Seguridad no aparecen en su navegación. El cambio de contraseña finaliza la sesión y muestra la confirmación en el login. La contraseña del propietario real no se modifica.

La verificación de auditoría incluye orden numérico de IDs cruzando un cambio de dígitos, JSONB reordenado, escrituras simultáneas, alteración de contenido, registro intermedio eliminado, historial legado y verificación parcial. El límite de lo probado y los siguientes pasos están en ACCOUNT_HANDOFF.md.

Cierre de verificación del 09/09/2026: inicio de sesión con la nueva contraseña confirmado; sesión habitual restaurada y escenario temporal eliminado. La comprobación de auditoría desde el navegador distingue 1 registro con contenido verificado y 13 históricos cuya continuidad se comprueba. Actividad reciente del worker confirmada después de reiniciarlo con el código actualizado.


## Suscripciones — 9 de septiembre de 2026

Suite completa: 108 pruebas (78 anteriores, 19 de adaptador/cupos/licencias, 6 de conciliación y 5 de notificaciones). Tipos, lint, compilación y autenticación HTTP pasan. Los fallos iniciales de los nuevos fixtures SQL se corrigieron antes de la suite final. Las pruebas usan empresas temporales que se eliminan al terminar y transportes simulados; no se invoca Stripe real.

Navegador: Configuración → Plan y uso carga con la sesión habitual, sin errores de página y sin presentar un plan comercial ficticio. La vista muestra cero reservas actuales y explica que no se reconstruye el consumo previo a configurar una suscripción. No se han activado pagos o contratado planes.
