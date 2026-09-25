import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const autorizado =
    (!!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) ||
    (!!process.env.DIAG_SECRET && auth === `Bearer ${process.env.DIAG_SECRET}`);
  if (!autorizado) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const pagos = await prisma.pago.findMany({
    include: { contenedor: { select: { nombre: true } }, cobrador: { select: { nombre: true } } },
    orderBy: { fecha: "asc" },
  });

  type Grupo = {
    clave: string;
    pagos: any[];
  };
  const grupos = new Map<string, any[]>();

  for (const p of pagos) {
    const clave = [
      p.fecha.toISOString().slice(0, 10),
      p.banco,
      p.importeEur !== null ? Number(p.importeEur).toFixed(2) : "-",
      p.importeUsd !== null ? Number(p.importeUsd).toFixed(2) : "-",
    ].join("|");
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(p);
  }

  const sospechosos: Grupo[] = [];
  for (const [clave, lista] of grupos) {
    if (lista.length > 1) sospechosos.push({ clave, pagos: lista });
  }

  return NextResponse.json({
    totalPagos: pagos.length,
    gruposSospechosos: sospechosos.length,
    detalle: sospechosos.map((g) => ({
      clave: g.clave,
      pagos: g.pagos.map((p) => ({
        id: p.id,
        persona: p.persona,
        fecha: p.fecha.toISOString().slice(0, 10),
        fechaHoraBanco: p.fechaHoraBanco?.toISOString() ?? null,
        idOrigen: p.idOrigen,
        importeEur: p.importeEur ? Number(p.importeEur) : null,
        importeUsd: p.importeUsd ? Number(p.importeUsd) : null,
        banco: p.banco,
        contenedor: p.contenedor?.nombre ?? null,
        cobrador: p.cobrador?.nombre ?? null,
        creadoEn: p.creadoEn.toISOString(),
      })),
    })),
  });
}
