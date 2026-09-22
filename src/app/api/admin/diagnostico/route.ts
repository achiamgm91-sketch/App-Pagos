import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (req.nextUrl.searchParams.get("accion") === "migrar-devolucion") {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Pago" ADD COLUMN IF NOT EXISTS "devuelto" BOOLEAN NOT NULL DEFAULT false`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Pago" ADD COLUMN IF NOT EXISTS "devueltoEn" TIMESTAMP(3)`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Pago" ADD COLUMN IF NOT EXISTS "devueltoPorId" TEXT`);
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN
         ALTER TABLE "Pago" ADD CONSTRAINT "Pago_devueltoPorId_fkey" FOREIGN KEY ("devueltoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
       EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
    );
    return NextResponse.json({ ok: true });
  }

  const contenedores = await prisma.contenedor.findMany({
    orderBy: [{ fechaInicio: "asc" }],
    select: {
      id: true,
      nombre: true,
      codigo: true,
      estado: true,
      fechaInicio: true,
      inicioBanco: true,
      saldoInicial: true,
      monedaSaldoInicial: true,
      totalFactura: true,
      monedaTotalFactura: true,
      creadoEn: true,
      _count: { select: { pagos: true } },
    },
  });

  const desde = req.nextUrl.searchParams.get("desde") || "2026-08-27";
  const hasta = req.nextUrl.searchParams.get("hasta") || "2026-08-31";
  const pagosPeriodo = await prisma.pago.findMany({
    where: { fecha: { gte: new Date(desde), lte: new Date(hasta) } },
    include: { contenedor: { select: { nombre: true, estado: true } } },
    orderBy: { fecha: "asc" },
  });

  return NextResponse.json({
    contenedores: contenedores.map((c) => ({
      ...c,
      saldoInicial: Number(c.saldoInicial),
      totalFactura: Number(c.totalFactura),
      inicioBanco: c.inicioBanco?.toISOString() ?? null,
      fechaInicio: c.fechaInicio.toISOString().slice(0, 10),
      creadoEn: c.creadoEn.toISOString(),
      pagos: c._count.pagos,
    })),
    pagosPeriodo: pagosPeriodo.map((p) => ({
      id: p.id,
      fecha: p.fecha.toISOString().slice(0, 10),
      persona: p.persona,
      banco: p.banco,
      importeEur: p.importeEur ? Number(p.importeEur) : null,
      importeUsd: p.importeUsd ? Number(p.importeUsd) : null,
      contenedor: p.contenedor?.nombre ?? null,
      contenedorEstado: p.contenedor?.estado ?? null,
      idOrigen: p.idOrigen,
    })),
  });
}
