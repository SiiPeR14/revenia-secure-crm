# Arquitectura inicial

Revenia comienza como un monolito modular en Next.js para evitar complejidad prematura. Las lecturas de la interfaz se resuelven en componentes de servidor; las integraciones externas usarán rutas API; las mutaciones internas pasarán por acciones de servidor autenticadas.

```text
Navegador
   ↓ HTTPS / cookie HttpOnly
Next.js
   ├── autenticación y sesión
   ├── autorización RBAC
   ├── contexto obligatorio del tenant
   ├── servicios de dominio
   ├── auditoría
   └── repositorios
          ↓
      PostgreSQL + RLS
```

Redis conserva contadores efímeros de seguridad. Mailpit está disponible como buzón local; el adaptador externo implementado es Resend y permanece apagado.

Las acciones de servidor autentican, validan con Zod, verifican RBAC y ejecutan la escritura y la auditoría en una transacción con contexto de empresa. Las relaciones entre entidades incluyen el tenant en sus claves foráneas. La navegación consulta los contadores reales y se revalida tras marcar mensajes o notificaciones como leídos.

Dashboard y Analytics consultan PostgreSQL. Los datos de muestra se insertan sin modificar registros existentes. Las simulaciones de proveedores y las reglas guardadas están identificadas como tales en la interfaz.

La cola PostgreSQL conecta las acciones aprobadas con un worker separado. Usa leases, idempotencia, comprobaciones de permisos y adaptadores HTTP. Los webhooks se almacenan cifrados y se concilian fuera de la petición, con reintentos y revisión. Las pruebas sustituyen el transporte HTTP; no contactan proveedores reales.

