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

  const sesion = await prisma.sabadellSesion.findFirst();

  const fechaParam = req.nextUrl.searchParams.get("fecha");
  if (fechaParam) {
    const pagosDia = await prisma.pago.findMany({
      where: { fecha: new Date(`${fechaParam}T00:00:00Z`) },
      select: {
        persona: true,
        banco: true,
        importeEur: true,
        importeUsd: true,
        idOrigen: true,
        fechaHoraBanco: true,
        creadoEn: true,
      },
      orderBy: { fechaHoraBanco: "asc" },
    });
    return NextResponse.json({
      fecha: fechaParam,
      total: pagosDia.length,
      pagos: pagosDia.map((p) => ({
        persona: p.persona,
        banco: p.banco,
        importeEur: p.importeEur ? Number(p.importeEur) : null,
        importeUsd: p.importeUsd ? Number(p.importeUsd) : null,
        idOrigen: p.idOrigen,
        fechaHoraBanco: p.fechaHoraBanco?.toISOString() ?? null,
        creadoEn: p.creadoEn.toISOString(),
      })),
    });
  }

  const desde = new Date("2026-09-15T00:00:00Z");
  const pagos = await prisma.pago.findMany({
    where: { fecha: { gte: desde } },
    select: { fecha: true, banco: true, importeEur: true, importeUsd: true, idOrigen: true, creadoEn: true },
    orderBy: { fecha: "asc" },
  });

  const porDiaBanco = new Map<string, number>();
  for (const p of pagos) {
    const clave = `${p.fecha.toISOString().slice(0, 10)}|${p.banco}`;
    porDiaBanco.set(clave, (porDiaBanco.get(clave) || 0) + 1);
  }

  const actividadReciente = await prisma.registroActividad.findMany({
    where: { creadoEn: { gte: desde } },
    orderBy: { creadoEn: "desc" },
    take: 50,
  });

  return NextResponse.json({
    sesionSabadell: sesion
      ? {
          sessionId: sesion.sessionId,
          accountUids: sesion.accountUids,
          validaHasta: sesion.validaHasta.toISOString(),
          expirada: sesion.validaHasta.getTime() < Date.now(),
          actualizadoEn: sesion.actualizadoEn.toISOString(),
        }
      : null,
    ahora: new Date().toISOString(),
    conteoPorDiaBanco: Object.fromEntries(porDiaBanco),
    actividadReciente: actividadReciente.map((a) => ({
      accion: a.accion,
      detalle: a.detalle,
      creadoEn: a.creadoEn.toISOString(),
    })),
  });
}
