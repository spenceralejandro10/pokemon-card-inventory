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

## Topics / Notificaciones previstos

### Activar

- Orders: `orders_v2`
- Messages
  - created
  - read
- Items
- Questions
- Item Price
- Stock Locations
- Shipments
- User Products
  - created
  - updated
  - purged
- Post Purchase
  - Claims
  - Claims Actions

### No activar por ahora

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

## Callback de notificaciones

```text
https://cnivcnexsqobipvqxero.supabase.co/functions/v1/mercadolibre-webhook
```

## Estado técnico al 2026-09-18

Funciones Supabase existentes:

- `sale-order`
- `admin-control`

Funciones pendientes para esta integración:

- `mercadolibre-oauth`
- `mercadolibre-webhook`

**Importante:** no finalizar la configuración de producción hasta que las rutas de OAuth y webhook estén implementadas y probadas.

## Seguridad

Las credenciales de Mercado Libre deben almacenarse como secretos/variables de entorno del backend (por ejemplo, secretos de Supabase Edge Functions), **nunca** en este repositorio ni en archivos públicos del frontend.

Credenciales que NO deben subirse a GitHub:

- Client Secret
- Access Token
- Refresh Token
- Contraseñas
- Claves privadas
- Service Role Key de Supabase
