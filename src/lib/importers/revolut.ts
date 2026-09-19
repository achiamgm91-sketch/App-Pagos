// Reconoce y procesa ficheros exportados de Revolut (CSV o XLSX).
// Cuando añadamos Sabadell/Wise, cada uno tendrá su propio fichero "parsers/<banco>.ts"
// con la misma forma (detecta(headers) + procesa(filas)) y se registran en index.ts.

export type FilaCruda = Record<string, any>;

export type PagoDetectado = {
  idOrigen: string;
  fecha: string; // YYYY-MM-DD
  persona: string;
  importe: number;
  moneda: string; // EUR o USD
  banco: string;
  fechaHoraBanco?: string; // ISO; instante del pago según el banco, si se conoce
};

const COLUMNAS_REVOLUT = [
  "Date started (UTC)",
  "Date completed (UTC)",
  "ID",
  "Type",
  "State",
  "Description",
  "Payment currency",
  "Total amount",
  "Sender name",
];

export function esFicheroRevolut(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim()));
  return COLUMNAS_REVOLUT.every((c) => set.has(c));
}

export function extraerPersona(descripcion: string, senderName: string | undefined): string {
  if (senderName && senderName.trim()) return senderName.trim().toUpperCase();
  const d = (descripcion || "").trim();
  let m = d.match(/^Dinero añadido por (.+)$/i);
  if (m) return m[1].trim().toUpperCase();
  m = d.match(/^De (.+)$/i);
  if (m) return m[1].trim().toUpperCase();
  m = d.match(/^Payment from (.+)$/i);
  if (m) return m[1].trim().toUpperCase();
  return d.toUpperCase();
}

export function procesarRevolut(filas: FilaCruda[]): PagoDetectado[] {
  const resultado: PagoDetectado[] = [];

  for (const fila of filas) {
    const tipo = String(fila["Type"] || "").trim();
    if (tipo !== "TOPUP" && tipo !== "TRANSFER") continue;

    const importe = parseFloat(fila["Total amount"]);
    if (!importe || importe <= 0) continue;

    const descripcion = String(fila["Description"] || "");
    if (descripcion.toUpperCase().includes("BOOMERANG")) continue; // traspaso interno propio

    const senderName = fila["Sender name"] ? String(fila["Sender name"]) : undefined;
    const persona = extraerPersona(descripcion, senderName);
    if (!persona) continue;

    const idOrigen = String(fila["ID"] || "").trim();
    if (!idOrigen) continue;

    // Usamos "Date completed (UTC)" — la fecha en la que el dinero está
    // realmente disponible, más correcta que "Date started" para contabilidad.
    const fechaRaw = String(fila["Date completed (UTC)"] || fila["Date started (UTC)"] || "").trim();
    const fecha = fechaRaw.slice(0, 10); // ya viene como YYYY-MM-DD

    const moneda = String(fila["Payment currency"] || "EUR").trim();

    resultado.push({
      idOrigen,
      fecha,
      persona,
      importe,
      moneda,
      banco: "Revolut",
    });
  }

  return resultado;
}
