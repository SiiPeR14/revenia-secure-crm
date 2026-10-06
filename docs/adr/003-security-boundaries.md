# ADR-003 · Separar laboratorio, comprobaciones y certificación
Estado: aceptado · 2026-10-06

El scanner no recibe una URL del navegador. Solo conecta a loopback literal y dos rutas fijas, con timeout y sin redirecciones. Un dominio público configurado se marca no evaluado en la sonda HTTP. Las reglas observan cabeceras/DB/auditoría, no explotan la aplicación.

El laboratorio vive en security-lab, usa datos ficticios y SQLite en memoria, carece de conexiones a Revenia y requiere opt-in. Docker limita publicación a 127.0.0.1, red interna, usuario no root, filesystem de solo lectura y capacidades eliminadas. El contexto de build y paquete de release lo excluyen.

Hallazgos deduplicados por empresa/regla. Un usuario puede documentar corrección o aceptación temporal; no marcar «resuelto». Solo un pass posterior lo resuelve; un análisis no evaluado no cierra nada.

Se descarta scanner genérico de Internet y consola de explotación dentro del SaaS. Consecuencia: menor cobertura deliberada; no detectar un fallo no demuestra su ausencia. Datos del laboratorio nunca se mezclan con evidencias del scanner.
