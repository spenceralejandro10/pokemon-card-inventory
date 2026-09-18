# Pokémon Card Inventory

Inventario web gratuito para buscar cartas Pokémon por nombre, número, idioma, set y rareza.

## Objetivo
- Frontend estático compatible con GitHub Pages.
- Datos iniciales en JSON.
- Imágenes alojadas en Google Drive.
- Preparado para migrar a una base de datos real más adelante.

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
- `docs/data-model.md`: esquema del modelo.
- `docs/extraction-rules.md`: protocolo de extracción.

## Publicación
Este proyecto está preparado para GitHub Pages desde la rama `main`.
