# CardNest

Catálogo web de cartas coleccionables, accesorios, producto sellado y electrónica, con propuestas por WhatsApp y checkout protegido por código de venta.

## Objetivo
- Frontend estático compatible con GitHub Pages.
- Datos iniciales en JSON.
- Catálogo principal y pedidos en Supabase, con respaldo local para las cartas.
- Imágenes en Google Drive o Supabase Storage.
- Flujo de envío, Top Loaders y comprobante PDF.

## Canales comerciales
- **CardNest directo:** catálogo, negociación asistida por WhatsApp, código de venta y flujo propio de envío.
- **Mercado Libre:** canal complementario para productos seleccionados. Cuando una compra se concreta y paga dentro de Mercado Libre, se aplican los términos, políticas y mecanismos de protección de esa plataforma.
- No se debe describir a Mercado Libre como “socio estratégico”, “partner oficial” o patrocinador salvo que exista un acuerdo que autorice expresamente esa denominación.
- El enlace público directo a la tienda/perfil de Mercado Libre solo debe publicarse cuando la cuenta productiva esté autorizada y la URL del vendedor haya sido verificada.
- Referencia técnica y comercial: `docs/integrations/mercadolibre.md`.

## Reglas de datos
- Nunca inventar rarezas: usar `unknown/null` cuando no se vea o no esté verificada.
- `name_original` conserva el nombre impreso.
- `canonical_name` se usa principalmente para normalizar cartas asiáticas a un nombre de búsqueda común en inglés.
- Idiomas iniciales: English, Spanish, Japanese, Chinese.
- El número de carta y el denominador deben preservarse exactamente como aparecen.
- Separar `rarity_detected` de `rarity_verified`.
- Toda carta debe tener `validation_status`.

## Estructura
- `index.html`: frontend.
- `styles.css`: estilos.
- `app.js`: búsqueda y filtros.
- `data/cards.json`: base de datos inicial.
- `supabase/functions/sale-order/index.ts`: función pública de validación y creación de pedidos.
- `scripts/verify.mjs`: comprobaciones estáticas reproducibles.
- `docs/data-model.md`: esquema del modelo.
- `docs/extraction-rules.md`: protocolo de extracción.
- `docs/integrations/mercadolibre.md`: arquitectura, seguridad, operación y comunicación pública del canal Mercado Libre.

## Verificación local

Requiere Node.js 18 o posterior y no instala dependencias:

```bash
npm test
```

## Publicación
Este proyecto está preparado para GitHub Pages desde la rama `main`.
