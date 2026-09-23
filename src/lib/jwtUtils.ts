/** Utilidades compartidas para firmar JWT RS256 (Revolut y Enable Banking usan el mismo patrón). */

export function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Acepta la clave privada en PEM directo o en base64 (para poder pegarla sin que se corrompan los saltos de línea al configurarla). */
export function normalizarClavePrivada(valor: string): string {
  const conNewlinesReales = valor.replace(/\\n/g, "\n").trim();
  if (conNewlinesReales.includes("-----BEGIN")) {
    return conNewlinesReales;
  }
  return Buffer.from(valor.trim(), "base64").toString("utf-8");
}
