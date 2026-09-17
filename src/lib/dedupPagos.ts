import { prisma } from "@/lib/prisma";

function normalizarPersona(s: string): string {
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
 * Descarta los candidatos que ya existen en el contenedor: por idOrigen exacto,
 * o por fecha + persona + importe (mismo pago real importado antes con un
 * idOrigen distinto, p.ej. una importación manual de fichero seguida de la
 * sincronización automática del banco).
 */
export async function filtrarPagosNuevos<T extends CandidatoPago>(
  contenedorId: string,
  candidatos: T[]
): Promise<T[]> {
  if (candidatos.length === 0) return [];

  const existentes = await prisma.pago.findMany({
    where: { contenedorId },
    select: { idOrigen: true, fecha: true, persona: true, importeEur: true, importeUsd: true },
  });

  const idsExistentes = new Set(existentes.map((p) => p.idOrigen));
  const claves = new Set<string>();
  for (const p of existentes) {
    const fecha = p.fecha.toISOString().slice(0, 10);
    const persona = normalizarPersona(p.persona);
    if (p.importeEur !== null) claves.add([fecha, persona, "EUR", p.importeEur.toFixed(2)].join("|"));
    if (p.importeUsd !== null) claves.add([fecha, persona, "USD", p.importeUsd.toFixed(2)].join("|"));
  }

  return candidatos.filter((c) => {
    if (idsExistentes.has(c.idOrigen)) return false;
    const clave = [c.fecha, normalizarPersona(c.persona), c.moneda, c.importe.toFixed(2)].join("|");
    return !claves.has(clave);
  });
}
