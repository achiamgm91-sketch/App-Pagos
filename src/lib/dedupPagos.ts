import { prisma } from "@/lib/prisma";

export function normalizarPersona(s: string): string {
  return s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^TRANSFERENCIA\s+/, "")
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type CandidatoPago = {
  fecha: string;
  persona: string;
  importe: number;
  moneda: string;
  idOrigen: string;
};

/**
 * Descarta los candidatos que ya existen en CUALQUIER contenedor: por idOrigen
 * exacto, o por fecha + persona + importe (mismo pago real importado antes con
 * otro idOrigen, p.ej. fichero manual vs sincronización del banco). Cada pago
 * existente solo "consume" un candidato, para no descartar pagos idénticos
 * legítimos (misma persona e importe el mismo día).
 */
export async function filtrarPagosNuevos<T extends CandidatoPago>(candidatos: T[]): Promise<T[]> {
  if (candidatos.length === 0) return [];

  const minFecha = candidatos.map((c) => c.fecha).sort()[0];
  const existentes = await prisma.pago.findMany({
    where: { fecha: { gte: new Date(minFecha) } },
    select: { idOrigen: true, fecha: true, persona: true, importeEur: true, importeUsd: true },
  });

  const idsCandidatos = new Set(candidatos.map((c) => c.idOrigen));
  const idsExistentes = new Set(
    (
      await prisma.pago.findMany({
        where: { idOrigen: { in: candidatos.map((c) => c.idOrigen) } },
        select: { idOrigen: true },
      })
    ).map((p) => p.idOrigen)
  );

  type Fila = { usado: boolean };
  const indice = new Map<string, Fila[]>();
  for (const p of existentes) {
    if (p.idOrigen && idsCandidatos.has(p.idOrigen)) continue;
    const fila: Fila = { usado: false };
    const fecha = p.fecha.toISOString().slice(0, 10);
    const persona = normalizarPersona(p.persona);
    const claves = [];
    if (p.importeEur !== null) claves.push([fecha, persona, "EUR", Number(p.importeEur).toFixed(2)].join("|"));
    if (p.importeUsd !== null) claves.push([fecha, persona, "USD", Number(p.importeUsd).toFixed(2)].join("|"));
    for (const k of claves) {
      if (!indice.has(k)) indice.set(k, []);
      indice.get(k)!.push(fila);
    }
  }

  return candidatos.filter((c) => {
    if (idsExistentes.has(c.idOrigen)) return false;
    const clave = [c.fecha, normalizarPersona(c.persona), c.moneda, c.importe.toFixed(2)].join("|");
    const fila = indice.get(clave)?.find((f) => !f.usado);
    if (fila) {
      fila.usado = true;
      return false;
    }
    return true;
  });
}
