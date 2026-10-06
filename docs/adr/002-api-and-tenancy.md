# ADR-002 · API privada, RLS y versión optimista
Estado: aceptado · 2026-10-06

Decisión: cookie opaca HttpOnly/SameSite Strict; API privada del mismo origen. Mutaciones requieren Origin canónico y JSON. El tenant proviene de la sesión, nunca del payload. Rol aplicativo sin BYPASSRLS, contexto local a transacción y FORCE RLS; FKs compuestas para relaciones.

POST/PATCH validan Zod; OpenAPI se deriva de los mismos esquemas. Dinero viaja como cadena decimal. PATCH elimina defaults de creación: omitir un campo preserva su valor. Un trigger incrementa version para cubrir escrituras antiguas; FOR UPDATE + comparación devuelve 409 si el cliente usa una versión obsoleta.

Archivo de clientes lógico: no borra facturas ni tareas. No se incorpora borrado permanente sin política de retención. API limitada a clientes/tareas: integraciones externas futuras exigirán OAuth/API tokens con scopes y contratos propios.

Nonce CSP distinto por petición; elimina unsafe-inline de scripts y fuerza renderizado dinámico. Se mantiene unsafe-inline de estilos para la UI existente; no se declara una política totalmente libre de inline. Desarrollo necesita unsafe-eval; producción lo excluye.

Coste: páginas dinámicas y control de versión obligatorio para consumidores; menor caché HTML a cambio de nonce por respuesta y privacidad. Limitaciones: no hay ETag, clave de idempotencia general en altas ni token público de API.
