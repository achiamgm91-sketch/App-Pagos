import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { llamarEnableBanking } from "@/lib/enableBanking/sesion";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const sesion = await prisma.sabadellSesion.findFirst();
  if (!sesion) return NextResponse.json({ error: "sin sesion" });

  if (req.nextUrl.searchParams.get("accion") === "completar-cuentas") {
    const detalle = await llamarEnableBanking(`/sessions/${sesion.sessionId}`);
    const cuentas: string[] = detalle.accounts || [];
    if (cuentas.length === 0) return NextResponse.json({ error: "Enable Banking no devolvió cuentas" });
    const actualizado = await prisma.sabadellSesion.update({
      where: { id: sesion.id },
      data: { accountUids: cuentas },
    });
    return NextResponse.json({ ok: true, accountUids: actualizado.accountUids });
  }

  let detalleCuentas: any = null;
  try {
    detalleCuentas = await llamarEnableBanking(`/sessions/${sesion.sessionId}`);
  } catch (e: any) {
    detalleCuentas = { error: e.message };
  }

  const pagos5000 = await prisma.pago.findMany({
    where: { OR: [{ importeUsd: { gte: 4900, lte: 5100 } }, { importeEur: { gte: 4900, lte: 5100 } }] },
    select: { id: true, fecha: true, persona: true, banco: true, importeEur: true, importeUsd: true, monedaOriginal: true, idOrigen: true },
    orderBy: { fecha: "desc" },
    take: 20,
  });

  return NextResponse.json({
    accountUids: sesion.accountUids,
    validaHasta: sesion.validaHasta,
    detalleCuentas,
    pagosCercaDe5000: pagos5000,
  });
}
