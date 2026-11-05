// Búsqueda de productos tolerante: ignora mayúsculas, tildes y puntuación, y cada
// palabra buscada se compara por separado (en cualquier orden), así
// "nivea brillo" encuentra "NIVEA FPS50 FAC.ANT.BRILLO M".

export type Searchable = {
  name: string;
  sku?: string | null;
  ean?: string | null;
  marca?: string | null;
  supplier?: string | null;
};

function clean(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenizeQuery(query: string): string[] {
  const c = clean(query);
  return c ? c.split(" ") : [];
}

/** Puntaje de una palabra buscada contra las palabras del producto (0 = no coincide). */
function tokenScore(token: string, words: string[], compact: string): number {
  let best = 0;
  for (const w of words) {
    if (w === token) return 4;
    if (w.startsWith(token)) best = Math.max(best, 3);
    else if (token.length >= 2 && w.includes(token)) best = Math.max(best, 2);
    // abreviaturas y plurales: "ant" -> "anti", "cremas" -> "crema"
    else if (w.length >= 3 && token.startsWith(w)) best = Math.max(best, 1.5);
  }
  if (best > 0) return best;
  // "fps 50" vs "fps50": comparar sin espacios
  if (token.length >= 3 && compact.includes(token)) return 1;
  return 0;
}

/**
 * null = no coincide. Si coincide devuelve un puntaje (mayor = más relevante).
 * Todas las palabras buscadas tienen que aparecer en nombre, marca, SKU, EAN o proveedor.
 */
export function scoreProduct(tokens: string[], item: Searchable): number | null {
  if (tokens.length === 0) return 0;
  const nameWords = clean(item.name).split(" ").filter(Boolean);
  const words = [
    ...nameWords,
    ...clean(item.marca ?? "").split(" "),
    ...clean(item.supplier ?? "").split(" "),
    ...clean(item.sku ?? "").split(" "),
    ...clean(item.ean ?? "").split(" "),
  ].filter(Boolean);
  const compact = words.join("");

  let total = 0;
  for (const t of tokens) {
    const s = tokenScore(t, words, compact);
    if (s === 0) return null;
    total += s;
  }
  // bonus si el nombre arranca con lo buscado
  if (nameWords[0] && nameWords[0].startsWith(tokens[0])) total += 1;
  return total;
}
