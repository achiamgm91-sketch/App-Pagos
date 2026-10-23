import { prisma } from "@/lib/prisma";

export type FiltrosEstadisticas = {
  contenedorId?: string; // "" = todos
  rango?: "30" | "todo";
};

export async function obtenerTotalesDiarios(filtros: FiltrosEstadisticas) {
  const where: any = { banco: { not: "Ajuste" }, devuelto: false };
  if (filtros.contenedorId) where.contenedorId = filtros.contenedorId;

  if (filtros.rango !== "todo") {
    const desde = new Date();
    desde.setDate(desde.getDate() - 29); // últimos 30 días incluyendo hoy
    desde.setHours(0, 0, 0, 0);
    where.fecha = { gte: desde };
  }

  const filas = await prisma.pago.groupBy({
    by: ["fecha"],
    where,
    _sum: { importeEur: true, importeUsd: true },
    orderBy: { fecha: "asc" },
  });

  return filas.map((f) => ({
    fecha: f.fecha.toISOString().slice(0, 10),
    totalEur: f._sum.importeEur !== null ? Number(f._sum.importeEur) : 0,
    totalUsd: f._sum.importeUsd !== null ? Number(f._sum.importeUsd) : 0,
  }));
}

export async function obtenerDuracionesContenedores() {
  const contenedores = await prisma.contenedor.findMany({
    include: { pagos: { orderBy: { fecha: "asc" } } },
    orderBy: { fechaInicio: "asc" },
  });

  const ultimoTipoCambio = await prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "desc" } });
  const ultimaTasa = ultimoTipoCambio ? Number(ultimoTipoCambio.usdPorEur) : null;

  return contenedores.map((c) => {
    const totalFactura = Number(c.totalFactura);
    const moneda = c.monedaTotalFactura;

    let acumulado = Number(c.saldoInicial);
    if (c.monedaSaldoInicial !== moneda && acumulado !== 0 && ultimaTasa) {
      acumulado = moneda === "EUR" ? acumulado / ultimaTasa : acumulado * ultimaTasa;
    }

    let fechaCompletado: string | null = null;
    for (const p of c.pagos) {
      const v = moneda === "EUR" ? p.importeEur : p.importeUsd;
      if (v === null) continue;
      acumulado += Number(v);
      if (fechaCompletado === null && acumulado >= totalFactura) {
        fechaCompletado = p.fecha.toISOString().slice(0, 10);
      }
    }

    const inicio = c.fechaInicio.toISOString().slice(0, 10);
    const hoy = new Date().toISOString().slice(0, 10);
    const finParaCalculo = fechaCompletado ?? hoy;
    const dias = Math.max(
      Math.round((new Date(finParaCalculo).getTime() - new Date(inicio).getTime()) / (1000 * 60 * 60 * 24)),
      0
    );

    return {
      id: c.id,
      nombre: c.nombre,
      fechaInicio: inicio,
      fechaCompletado,
      dias,
      enCurso: fechaCompletado === null,
      pct: totalFactura > 0 ? Math.min(Math.round((acumulado / totalFactura) * 100), 100) : 0,
    };
  });
}
