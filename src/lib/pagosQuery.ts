import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { ORDEN_BANCO_DESC, ORDEN_BANCO_ASC } from "@/lib/pagosBanco";

export const PAGE_SIZE = 50;

export type FiltrosPagos = {
  contenedorId?: string; // "" = todos, "__SIN_CONTENEDOR__" = sin contenedor
  fecha?: string; // yyyy-mm-dd, "" = todas
  nombre?: string;
  cobrador?: string; // nombre del cobrador, "__SIN_ASIGNAR__" = sin asignar, "" = todos
  monto?: string;
  moneda?: "EUR" | "USD";
};

function construirWhere(filtros: FiltrosPagos): Prisma.PagoWhereInput {
  const where: Prisma.PagoWhereInput = {};

  if (filtros.contenedorId === "__SIN_CONTENEDOR__") {
    where.contenedorId = null;
  } else if (filtros.contenedorId) {
    where.contenedorId = filtros.contenedorId;
  }

  if (filtros.fecha) {
    where.fecha = new Date(filtros.fecha);
  }

  if (filtros.nombre) {
    where.persona = { contains: filtros.nombre, mode: "insensitive" };
  }

  if (filtros.cobrador === "__SIN_ASIGNAR__") {
    where.cobradorId = null;
    where.banco = { not: "Ajuste" };
  } else if (filtros.cobrador) {
    where.cobrador = { nombre: filtros.cobrador };
  }

  const montoNum = filtros.monto ? parseFloat(filtros.monto.trim().replace(",", ".")) : null;
  if (montoNum !== null && !isNaN(montoNum)) {
    const campo = filtros.moneda === "USD" ? "importeUsd" : "importeEur";
    (where as any)[campo] = { gte: montoNum - 0.005, lte: montoNum + 0.005 };
  }

  return where;
}

const includePago = {
  cobrador: true,
  contenedor: true,
  cobradorAsignadoPor: true,
} as const;

export function simplificarPago(p: any) {
  let etiquetaAsignacion: string | null = null;
  if (p.cobradorAsignadoPor) {
    if (p.cobradorAsignadoPor.rol === "ADMIN") etiquetaAsignacion = "Admin";
    else if (p.cobradorAsignadoPor.cobradorId && p.cobradorAsignadoPor.cobradorId === p.cobradorId)
      etiquetaAsignacion = "Auto";
    else etiquetaAsignacion = p.cobradorAsignadoPor.nombre ? `Por ${p.cobradorAsignadoPor.nombre}` : "Otro";
  }
  return {
    id: p.id,
    fecha: p.fecha.toISOString().slice(0, 10),
    persona: p.persona,
    banco: p.banco,
    contenedorId: p.contenedorId,
    contenedorNombre: p.contenedor?.nombre ?? null,
    cobradorNombre: p.cobrador?.nombre ?? null,
    etiquetaAsignacion,
    importeUsd: p.importeUsd !== null ? Number(p.importeUsd) : null,
    importeEur: p.importeEur !== null ? Number(p.importeEur) : null,
    tasaCambio: p.tasaCambio !== null ? Number(p.tasaCambio) : null,
    fechaTasaCambio: p.fechaTasaCambio ? p.fechaTasaCambio.toISOString().slice(0, 10) : null,
    monedaOriginal: p.monedaOriginal,
  };
}

export async function obtenerPagosFiltrados(filtros: FiltrosPagos, page: number) {
  const where = construirWhere(filtros);

  const [pagos, agregado, totalCount, sinAsignarCount] = await Promise.all([
    prisma.pago.findMany({
      where,
      include: includePago,
      orderBy: ORDEN_BANCO_DESC,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.pago.aggregate({
      where,
      _sum: { importeUsd: true, importeEur: true },
    }),
    prisma.pago.count({ where }),
    prisma.pago.count({ where: { ...where, cobradorId: null, banco: { not: "Ajuste" } } }),
  ]);

  return {
    pagos,
    totalUsd: agregado._sum.importeUsd !== null ? Number(agregado._sum.importeUsd) : 0,
    totalEur: agregado._sum.importeEur !== null ? Number(agregado._sum.importeEur) : 0,
    totalCount,
    sinAsignarCount,
    hasMore: page * PAGE_SIZE < totalCount,
  };
}
