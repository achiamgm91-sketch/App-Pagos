// Reconoce y procesa extractos de Banco Sabadell (.xls).
// A diferencia de Revolut, el fichero no tiene la cabecera en la primera
// fila: antes hay varias filas de metadatos (cuenta, titular, rango de
// fechas). La detección de cabecera real se hace en index.ts, escaneando
// las primeras filas del fichero hasta encontrar una que coincida con
// COLUMNAS_SABADELL.

export type FilaCruda = Record<string, any>;

export type PagoDetectado = {
  idOrigen: string;
  fecha: string; // YYYY-MM-DD
  persona: string;
  importe: number;
  moneda: string;
  banco: string;
};

export const COLUMNAS_SABADELL = ["F. Operativa", "Concepto", "F. Valor", "Importe", "Saldo"];

export function esFicheroSabadell(headers: string[]): boolean {
  const set = new Set(headers.map((h) => String(h).trim()));
  return COLUMNAS_SABADELL.every((c) => set.has(c));
}

function extraerPersona(concepto: string): string {
  const c = (concepto || "").trim();
  // Formatos posibles:
  // "ABONO TRANSFERENCIA DE <persona>"
  // "TRANSFERENCIA DE <persona>"
  // "TRANSFERENCIA <persona>" (sin "DE")
  const m = c.match(/^(?:ABONO\s+)?TRANSFERENCIAS?\s+(?:DE\s+)?(.+)$/i);
  if (m) return m[1].trim();
  return c;
}

function normalizarFecha(valor: any): string | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  const s = String(valor).trim();
  // Formato español dd/mm/yyyy
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Ya viene en YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

export function procesarSabadell(filas: FilaCruda[]): PagoDetectado[] {
  const resultado: PagoDetectado[] = [];

  for (const fila of filas) {
    const concepto = String(fila["Concepto"] || "").trim();
    if (!concepto) continue;
    if (concepto.toUpperCase().includes("BOOMERANG")) continue; // traspaso interno propio

    // El Excel de Sabadell usa coma como separador de miles y punto como decimal
    // (p.ej. "1,000.00"), no formato español: hay que quitar las comas, no cambiarlas por puntos.
    const importe = parseFloat(String(fila["Importe"]).replace(/,/g, ""));
    if (!importe || importe <= 0) continue;

    const persona = extraerPersona(concepto);
    if (!persona) continue;

    // Usamos "F. Valor" (fecha valor) — cuándo el dinero está realmente
    // disponible, el mismo criterio que usamos con "Date completed" en Revolut.
    const fecha = normalizarFecha(fila["F. Valor"]) || normalizarFecha(fila["F. Operativa"]);
    if (!fecha) continue;

    // Sabadell no da un ID de movimiento único en este informe, así que
    // construimos uno estable combinando fecha + importe + saldo resultante
    // (el saldo tras cada movimiento es, en la práctica, siempre distinto).
    const saldo = String(fila["Saldo"] ?? "").trim();
    const idOrigen = `SABADELL:${fecha}:${importe}:${saldo}`;

    resultado.push({
      idOrigen,
      fecha,
      persona,
      importe,
      moneda: "EUR",
      banco: "Sabadell",
    });
  }

  return resultado;
}
