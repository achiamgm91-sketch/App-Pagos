import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Orden del banco: primero por fecha del pago y, dentro del mismo día, por la hora
// real del banco (el último pago recibido es el primero). Nunca por nombre.
export const ORDEN_BANCO_DESC: Prisma.PagoOrderByWithRelationInput[] = [
  { fecha: "desc" },
  { fechaHoraBanco: { sort: "desc", nulls: "last" } },
  { creadoEn: "desc" },
];
export const ORDEN_BANCO_ASC: Prisma.PagoOrderByWithRelationInput[] = [
  { fecha: "asc" },
  { fechaHoraBanco: { sort: "asc", nulls: "first" } },
  { creadoEn: "asc" },
];

function fechaISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export type ContenedorAsignable = {
  id: string;
  nombre: string;
  fechaInicio: Date;
  inicioBanco: Date | null;
  estado: string;
};

/**
 * Contenedores de más nuevo a más antiguo; el primero es el activo. Es la cadena por
 * la que "baja" un pago cuyo instante es anterior al corte de un contenedor.
 */
export async function cargarCadenaContenedores(): Promise<ContenedorAsignable[]> {
  const todos = await prisma.contenedor.findMany({
    select: { id: true, nombre: true, fechaInicio: true, inicioBanco: true, estado: true },
    orderBy: [{ fechaInicio: "desc" }, { creadoEn: "desc" }],
  });
  const idxActivo = todos.findIndex((c) => c.estado === "ACTIVO");
  return idxActivo === -1 ? [] : todos.slice(idxActivo);
}

/**
 * A qué contenedor va un pago según el orden del banco.
 * - Contenedor con corte (inicioBanco): recibe los pagos posteriores al corte; los
 *   anteriores bajan al contenedor anterior de la cadena.
 * - Contenedor clásico (sin corte): recibe los pagos con fecha >= fechaInicio, y los
 *   anteriores se descartan (comportamiento de siempre).
 */
export function elegirContenedor(
  cadena: ContenedorAsignable[],
  pago: { fecha: string; fechaHoraBanco?: string | null }
): ContenedorAsignable | null {
  for (const c of cadena) {
    if (!c.inicioBanco) {
      return pago.fecha >= fechaISO(c.fechaInicio) ? c : null;
    }
    const posteriorAlCorte = pago.fechaHoraBanco
      ? new Date(pago.fechaHoraBanco).getTime() > c.inicioBanco.getTime()
      : pago.fecha >= fechaISO(c.inicioBanco); // sin hora: el mismo día del corte se queda en el nuevo
    if (posteriorAlCorte) return c;
  }
  return null;
}

/** Rellena la hora del banco en pagos ya guardados que no la tenían. */
export async function completarHorasBanco(detectados: { idOrigen: string; fechaHoraBanco?: string }[]) {
  const conHora = detectados.filter((d) => d.fechaHoraBanco);
  if (conHora.length === 0) return 0;
  const porId = new Map(conHora.map((d) => [d.idOrigen, d.fechaHoraBanco as string]));
  const sinHora = await prisma.pago.findMany({
    where: { idOrigen: { in: [...porId.keys()] }, fechaHoraBanco: null },
    select: { id: true, idOrigen: true },
  });
  for (const p of sinHora) {
    await prisma.pago.update({
      where: { id: p.id },
      data: { fechaHoraBanco: new Date(porId.get(p.idOrigen as string) as string) },
    });
  }
  return sinHora.length;
}
