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
    else if (w.length >= 3 && !/^\d+$/.test(w) && token.startsWith(w)) best = Math.max(best, 1.5);
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

  // Búsqueda por código (EAN/SKU): solo se mira EAN y SKU, nunca el nombre, y
  // los ceros iniciales no importan (044432 = 44432). Evita que "4006000017396"
  // traiga productos cuyo nombre tiene "400".
  if (tokens.length === 1 && /^\d{6,}$/.test(tokens[0])) {
    const q = tokens[0].replace(/^0+/, "");
    let best = 0;
    for (const code of [item.ean, item.sku]) {
      const c = (code ?? "").replace(/\D/g, "").replace(/^0+/, "");
      if (!c || !q) continue;
      if (c === q) best = Math.max(best, 10);
      else if (c.startsWith(q) || q.startsWith(c) === false && c.includes(q)) best = Math.max(best, 5);
    }
    return best > 0 ? best : null;
  }

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
