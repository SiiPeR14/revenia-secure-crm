# Cuentas, equipo y auditoría — bloque de continuación

Continuación más reciente: [BILLING_HANDOFF.md](BILLING_HANDOFF.md). Este documento describe el bloque anterior.

Actualizado el 9 de septiembre de 2026. Continúa el trabajo de motores documentado en ENGINE_HANDOFF.md.

## Límite autorizado

Este bloque tiene un nuevo máximo de 300 créditos. Saldo inicial observado: 733,388185. No bajar de 433,388185 y cerrar con margen por retrasos de contabilización. No usar créditos de restablecimiento. Los proveedores externos y la publicación permanecen apagados.

## Implementado

- Mi cuenta: identidad real, empresas disponibles, sesiones activas, cambio de contraseña y cierre de otras sesiones. Las operaciones sensibles verifican la contraseña actual y limitan intentos mediante Redis.
- Cambio de contraseña: escritura transaccional, control de cambios concurrentes, incremento de versión y revocación de todas las sesiones. La contraseña y los hashes no se devuelven a la página ni se escriben en auditoría.
- Sesiones: el servidor comprueba ahora la pertenencia actual y el rol, además de la identidad. Cambios de rol, retirada de miembros, cambios de contraseña y deshabilitación revocan sesiones también mediante disparadores de base de datos. Restaurar un rol o reactivar una identidad no revive tokens antiguos.
- Equipo: listado por empresa, roles y retirada de acceso con reautenticación del propietario. No se permite modificar propietarios ni el propio acceso. La retirada conserva la cuenta y los accesos a otras empresas.
- Invitaciones: creadas por el propietario, vinculadas a correo y rol, con 256 bits aleatorios, solo hash almacenado, 72 horas de vigencia, revocación y uso único. Renovar una invitación invalida la anterior. El propietario comparte manualmente el enlace; no se ha implementado ni ejecutado envío de correo de invitaciones.
- Aceptación: crea una cuenta si no existe. Una cuenta existente debe acreditar su contraseña; la invitación nunca la sustituye ni modifica su nombre. Se comprueban nuevamente la vigencia y los permisos del invitador. El enlace no certifica por sí solo la propiedad del buzón de email; su entrega al destinatario es responsabilidad del propietario.
- Enlace privado: usa un fragmento de URL que no viaja al servidor al cargar la página. Se retira de la barra de direcciones y se conserva solo en el formulario; un error de validación permite reintentar. Si se recarga, volver a abrir el enlace original.
- Cambio de empresa: comprueba membresía, renueva el token y revoca el anterior sin alargar el vencimiento. La interfaz muestra identidad y empresa reales. Los enlaces de Equipo y Seguridad se ocultan a roles sin permiso; el servidor conserva la comprobación independiente.
- Protección de origen: las rutas de autenticación comparan el origen completo con APP_URL o el origen de la petición local; ya no confían en x-forwarded-host proporcionado por el cliente.
- Auditoría persistente: huella canónica v2 que resiste la reordenación de JSONB, lectura consistente sin escrituras, lotes y límite de 100.000 registros. La pantalla Seguridad permite comprobar contenido y continuidad. Los registros v1 se identifican como históricos, con continuidad comprobada pero sin afirmar verificación completa del contenido.

## Migraciones

007: funciones de cuenta y equipo y comprobación actual de membresía en sesiones.
008: invitaciones con RLS y funciones restringidas.
009: cambio de empresa con renovación de sesión.
010: versión de hash de auditoría. El valor predeterminado sigue siendo v1 para etiquetar correctamente trabajadores antiguos; el escritor nuevo indica v2 expresamente.
011: revocación persistente por cambios de identidad o pertenencia.

Las migraciones están aplicadas al entorno local. La comprobación de despliegue exige las tablas, funciones y disparadores nuevos.

## Verificación

`npm run test:all:docker`: 78 pruebas, tipos, ESLint y compilación. Desglose: 12 unitarias, 8 PostgreSQL/Redis, 28 motores, 21 cuentas/invitaciones/empresas y 9 auditoría.

Se comprueban reautenticación, revocación entre empresas, cambios simultáneos de contraseña, sesiones obsoletas, protección del propietario, acceso cruzado, invitaciones caducadas/retiradas/reemplazadas, aceptación simultánea, protección de cuentas existentes y cambio de empresa concurrente. Auditoría: JSONB, 25 escrituras simultáneas, alteración de contenido, borrado intermedio, registros antiguos, límites, RLS, solo lectura y orden numérico cruzando un cambio de dígitos.

El navegador utiliza una empresa y cuentas temporales separadas del espacio de Sergi. Se prueba invitación, rechazo de contraseñas diferentes, aceptación, login con rol VIEWER y ausencia de los enlaces privilegiados. El cambio de contraseña se prueba únicamente con la cuenta temporal.

## Próximo trabajo

1. Suscripciones de Revenia: precios, contratación, cobro recurrente y límites por plan, separados de los cobros de facturas de cada empresa.
2. Alta inicial segura de empresas/propietarios. Las invitaciones resuelven incorporación de miembros, no el alta pública de un nuevo negocio.
3. Recuperación de cuenta, MFA, verificación del correo y entrega de invitaciones mediante proveedor autorizado. No implementar recuperación entregando enlaces a un solicitante sin verificar su identidad.
4. Ampliar comprobaciones de permisos por ruta y acción, incluida la presentación de denegaciones de acceso.
5. Copias/restauración, retención, exportación/borrado, rotación de claves, límites monetarios y observabilidad.
6. Anclaje externo de auditoría: una cadena local no descarta que un administrador elimine el final o reconstruya el historial. Los registros históricos conservan su formato y no se reescriben como si fueran verificables.
7. Construcción/prueba de contenedores y sandboxes de proveedores cuando existan las cuentas. Dominio, documentación y validación legal siguen pendientes.

No se ha publicado el servicio ni enviado mensajes o realizado cargos. El worker continúa limitado por el interruptor global de servicios externos.

## Referencia técnica

Las decisiones de reautenticación y revocación se contrastaron con [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) y [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). Estas medidas no equivalen a una auditoría independiente ni a certificación de cumplimiento.

## Cierre del bloque — 9 de septiembre de 2026

- Navegador: contraseña cambiada y nuevo inicio de sesión confirmado con la cuenta temporal. Sesión habitual del propietario restaurada; sus credenciales no se han modificado.
- Empresa, invitaciones y usuarios temporales eliminados mediante la limpieza acotada del escenario de prueba.
- Verificación visual de auditoría en la empresa habitual: 14 registros, 1 con contenido verificado y 13 históricos con continuidad comprobada; las limitaciones se muestran expresamente.
- Motor reiniciado con el código actualizado y actividad reciente confirmada. Servicios externos siguen desactivados.
- Última consulta de saldo: 461,688235 créditos frente a 733,388185 al inicio: aproximadamente 271,70 consumidos. Se termina con margen respecto al máximo de 300; la cifra puede incorporar otros usos simultáneos de la cuenta y no incluye el pequeño coste del cierre.
- Siguiente bloque: suscripciones de la plataforma y límites por plan; después alta inicial, recuperación de cuenta y MFA. No publicar todavía.
