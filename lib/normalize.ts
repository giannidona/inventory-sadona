// Normalización compartida (sin dependencias de React ni de servidor).

/**
 * Clave de comparación: ignora mayúsculas, tildes, espacios y puntuación,
 * así "L'Oréal", "LOREAL" y "Loreal" se reconocen como lo mismo.
 */
export function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Devuelve la escritura que ya existe para ese valor (si hay una equivalente),
 * o el valor limpio. Para marcas, `uppercaseIfNew` lo pasa a MAYÚSCULAS cuando es nuevo.
 */
export function canonicalValue(
  input: string,
  existing: string[],
  uppercaseIfNew: boolean
): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  const key = normalizeKey(trimmed);
  const match = existing.find((e) => normalizeKey(e) === key);
  if (match) return match;
  return uppercaseIfNew ? trimmed.toUpperCase() : trimmed;
}
