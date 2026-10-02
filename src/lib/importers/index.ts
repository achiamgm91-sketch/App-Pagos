import { esFicheroRevolut, procesarRevolut, FilaCruda, PagoDetectado } from "./revolut";
import { esFicheroSabadell, procesarSabadell } from "./sabadell";

type Parser = {
  banco: string;
  detecta: (headers: string[]) => boolean;
  procesa: (filas: FilaCruda[], metadatos?: any[][]) => PagoDetectado[];
};

const PARSERS: Parser[] = [
  { banco: "Revolut", detecta: esFicheroRevolut, procesa: procesarRevolut },
  { banco: "Sabadell", detecta: esFicheroSabadell, procesa: procesarSabadell },
  // Wise se añadirá aquí con su propio parsers/wise.ts
];

export function detectarBanco(headers: string[]): Parser | null {
  return PARSERS.find((p) => p.detecta(headers)) ?? null;
}

export function bancosSoportados(): string[] {
  return PARSERS.map((p) => p.banco);
}

const FILAS_MAX_BUSQUEDA_CABECERA = 20;

/**
 * Busca la fila de cabecera real dentro de las primeras N filas del fichero
 * (algunos bancos, como Sabadell, anteponen varias filas de metadatos antes
 * de la tabla de movimientos) y devuelve el parser correspondiente junto con
 * el índice de esa fila.
 */
export function detectarBancoEnFilasCrudas(
  filasCrudas: any[][]
): { parser: Parser; filaCabeceraIndex: number } | null {
  const limite = Math.min(filasCrudas.length, FILAS_MAX_BUSQUEDA_CABECERA);
  for (let i = 0; i < limite; i++) {
    const headers = (filasCrudas[i] || []).map((h) => String(h ?? "").trim());
    const parser = detectarBanco(headers);
    if (parser) return { parser, filaCabeceraIndex: i };
  }
  return null;
}

/**
 * Convierte una matriz cruda (array de filas, cada una array de celdas) en
 * un array de objetos usando la fila de cabecera indicada.
 */
export function filasCrudasAObjetos(filasCrudas: any[][], filaCabeceraIndex: number): FilaCruda[] {
  const headers = (filasCrudas[filaCabeceraIndex] || []).map((h) => String(h ?? "").trim());
  const objetos: FilaCruda[] = [];
  for (let i = filaCabeceraIndex + 1; i < filasCrudas.length; i++) {
    const fila = filasCrudas[i];
    if (!fila || fila.every((c) => c === "" || c === null || c === undefined)) continue;
    const obj: FilaCruda = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = fila[idx];
    });
    objetos.push(obj);
  }
  return objetos;
}
