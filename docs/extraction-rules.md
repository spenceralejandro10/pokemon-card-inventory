# Protocolo de extracción de cartas Pokémon

## Prioridad de identificación
1. Número de carta completo.
2. Nombre impreso.
3. Idioma.
4. HP.
5. Set/código/símbolo.
6. Rareza/símbolo de rareza.
7. Tipo/variante: ex, V, VMAX, VSTAR, GX, Trainer, Energy.
8. Ataques, habilidades y daño.
9. Ilustrador.
10. Regulación, año y otros símbolos.

## Política de certeza
- No completar datos no visibles por intuición.
- Si un campo no se puede leer: null.
- Si un dato proviene de catálogo, marcarlo como verificado.
- No confundir rareza con variante.
- No asumir que ausencia aparente de símbolo equivale a Common.
- Conservar exactamente numerador y denominador.
- Para japonés/chino, el nombre canónico en inglés es auxiliar; nunca reemplaza name_original.

## Estados recomendados
- detected
- needs_image_url
- needs_rarity_verification
- needs_catalog_verification
- verified
- rejected
