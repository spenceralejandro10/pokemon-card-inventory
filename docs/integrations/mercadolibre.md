# CardNest — Integración Mercado Libre

> Documento interno de referencia del proyecto. No guardar aquí Client Secret, access tokens, refresh tokens, contraseñas ni otras credenciales.

## Aplicación

- **Marca pública:** CardNest
- **Repositorio:** `spenceralejandro10/pokemon-card-inventory`
- **Proyecto Supabase:** `pokemon-card-inventory`
- **Supabase project ref:** `cnivcnexsqobipvqxero`
- **Supabase URL:** `https://cnivcnexsqobipvqxero.supabase.co`

## Configuración prevista en Mercado Libre Developers

### Redirect URI

```text
https://cnivcnexsqobipvqxero.supabase.co/functions/v1/mercadolibre-oauth
```

### Producto y permisos

- Mercado Libre: **activado**
- Mercado Pago: **desactivado**
- Lectura / Read: **activado**
- Escritura / Write: **activado**
- PKCE: **activado**
- Skip PKCE: **no activar**

## Topics / Notificaciones preparados pero desactivados

Aplicar principio de mínimo alcance: **no activar topics mientras CardNest no utilice sus datos en un flujo productivo probado**. El webhook ya reconoce los siguientes topics para facilitar su implementación posterior, pero reconocerlos técnicamente no autoriza activarlos.

### Dejar desactivados por ahora

- Orders: `orders_v2`
- Items: `items`
- Questions: `questions`
- Messages: `messages`
- Shipments: `shipments`

### Tampoco activar

- Item Price
- Stock Locations
- User Products y sus variantes
- Post Purchase, Claims y Claims Actions
- Orders Feedback
- Insurance Messages
- Price Suggestions
- Quotations
- Item Competition
- Catalog Suggestions
- Promotions
- User Products Families
- VIS Leads
- Payments
- Invoices
- Otros topics que CardNest todavía no utilice

El webhook responde `200` a eventos ajenos o no soportados para evitar reintentos, pero no los almacena ni hace llamadas autenticadas con ellos. Antes de consultar un recurso verifica `application_id`, `user_id`, cuenta `MCO`, topic y prefijo de ruta. Cuando se implemente una función productiva concreta, activar únicamente el topic correspondiente después de probarla con usuarios de test.

## Callback de notificaciones

```text
https://cnivcnexsqobipvqxero.supabase.co/functions/v1/mercadolibre-webhook
```

## Estado técnico al 2026-09-19

Funciones Supabase activas:

- `sale-order`
- `admin-control`
- `mercadolibre-oauth`
- `mercadolibre-webhook`

La integración de Mercado Libre ya tiene:

- OAuth 2.0 Server Side con PKCE S256 y validación de `state`.
- Inicio de autorización restringido a una sesión administrativa válida de CardNest.
- Client ID y Client Secret almacenados como Edge Function Secrets.
- Access token y refresh token almacenados cifrados mediante Supabase Vault.
- Renovación segura de tokens con bloqueo temporal para evitar reutilizar simultáneamente un refresh token.
- Webhook público HTTPS con respuesta inmediata y verificación posterior del recurso contra la API oficial.
- Persistencia de eventos de webhook sin guardar en bruto la respuesta del recurso, para minimizar datos personales.
- Panel administrativo con preflight técnico, confirmaciones manuales, autorización bloqueada por defecto y desconexión.
- Validación cruzada del usuario devuelto por el token y `/users/me`, además de rechazo de cuentas que no sean `MCO`.
- Validación posterior al consentimiento de que el token incluya los scopes `read` y `write`.
- Rechazo de autorizaciones sin refresh token y rotación serializada con recuperación después de fallos transitorios.
- Cada intento OAuth queda ligado a la sesión administrativa que lo inició; cerrar sesión o desconectar invalida callbacks pendientes.
- Interruptor servidor de habilitación productiva. La autorización permanece bloqueada aunque el frontend sea manipulado mientras `MERCADOLIBRE_AUTHORIZATION_ENABLED` no sea exactamente `true`.

## Alcance funcional actual

- **No existe publicación automática.** Marcar un producto como “Preparado para ML” solo guarda una selección interna con estado `ready`.
- **No existe sincronización automática de stock o precios.** El webhook valida y registra metadatos mínimos del aviso, pero todavía no modifica inventario ni publicaciones.
- Los productos demo, sin stock, archivados, en borrador, sin datos básicos, sin imagen HTTPS o con precio menor de `$3.000 COP` no pueden quedar preparados.
- No se debe prometer publicación, sincronización bidireccional ni gestión de ventas hasta implementar y probar esos subsistemas por separado.

### Secrets de Edge Functions

Deben existir en Supabase:

- `MERCADOLIBRE_CLIENT_ID`
- `MERCADOLIBRE_CLIENT_SECRET`

Debe permanecer ausente o con un valor distinto de `true` durante la revisión:

- `MERCADOLIBRE_AUTHORIZATION_ENABLED`

Solo establecer `MERCADOLIBRE_AUTHORIZATION_ENABLED=true` después de completar la lista obligatoria, probar con usuarios de test y aprobar expresamente la salida productiva.

No copiar sus valores a este repositorio.

### Lista obligatoria antes del paso humano

En Mercado Libre Developers, verificar y marcar en el panel de CardNest:

1. El **Redirect URI** coincide carácter por carácter con el indicado en este documento.
2. El **callback de notificaciones** coincide carácter por carácter y todos los topics permanecen desactivados hasta implementar y probar el flujo productivo correspondiente.
3. Mercado Libre está activado con Read y Write; Mercado Pago está desactivado.
4. PKCE está activado y Skip PKCE está desactivado.
5. Se usará la cuenta principal de Mercado Libre Colombia (`MCO`).
6. La revisión técnica de CardNest muestra configuración, Vault, webhook y país en estado aprobado.
7. Todas las pruebas de publicación, compra, preguntas y ventas se realizan únicamente entre usuarios de test; nunca con la cuenta personal o productiva.

El backend vuelve a ejecutar el preflight justo antes de crear el `state` OAuth y rechaza llamadas que no incluyan las tres confirmaciones manuales.

### Paso humano final

Desde el panel de administración de CardNest, entrar a **Mercado Libre** y pulsar **Autorizar cuenta**. Mercado Libre mostrará su pantalla oficial de consentimiento y devolverá el código al callback de Supabase.

La autorización no publica productos por sí sola. Si la pantalla de consentimiento muestra una aplicación, país, cuenta o permisos inesperados, cancelar y revisar la configuración; no continuar “para probar”.

## Seguridad

Las credenciales de Mercado Libre deben almacenarse como secretos/variables de entorno del backend (por ejemplo, secretos de Supabase Edge Functions), **nunca** en este repositorio ni en archivos públicos del frontend.

Credenciales que NO deben subirse a GitHub:

- Client Secret
- Access Token
- Refresh Token
- Contraseñas
- Claves privadas
- Service Role Key de Supabase
