# Modelo de datos

## Campos mínimos
| Campo | Descripción |
|---|---|
| id | ID interno único |
| name_original | Nombre tal como aparece impreso |
| canonical_name | Nombre normalizado para búsqueda |
| language | English, Spanish, Japanese o Chinese |
| number | Número exacto de carta, ej. 070/066 |
| set_name | Nombre de expansión, si está verificado |
| set_code | Código del set, si existe |
| hp | HP visible |
| rarity_detected | Rareza inferida solo desde elementos visibles |
| rarity_verified | Rareza confirmada contra catálogo |
| variant | ex, V, VMAX, VSTAR, GX, holo, reverse, etc. |
| image_url | URL directa para renderizar imagen |
| source_image_url | URL del archivo original |
| validation_status | Estado de validación |

## Reglas de nombres
- English: conservar nombre original.
- Spanish: conservar nombre original en español.
- Japanese/Chinese: conservar nombre original y añadir canonical_name en inglés si se identifica con seguridad.

## Regla de rareza
Si no se ve con seguridad, no se asigna. Se almacena null y se marca para verificación.
