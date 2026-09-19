import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizarPersona } from "@/lib/dedupPagos";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const accion = req.nextUrl.searchParams.get("accion");

  if (accion === "diagnostico") {
    const recientes = await prisma.pago.findMany({
      where: { creadoEn: { gte: new Date("2026-09-17T15:00:00Z") } },
      include: { contenedor: { select: { nombre: true } } },
      orderBy: { creadoEn: "asc" },
    });

    const todos = await prisma.pago.findMany({
      where: { fecha: { gte: new Date("2026-08-25") } },
      include: { contenedor: { select: { nombre: true } } },
    });
    const grupos = new Map<string, typeof todos>();
    for (const p of todos) {
      const k = [p.fecha.toISOString().slice(0, 10), normalizarPersona(p.persona), Number(p.importeEur ?? 0).toFixed(2)].join("|");
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(p);
    }
    const posiblesDuplicados = [...grupos.entries()]
      .filter(([, v]) => v.length > 1)
      .map(([k, v]) => ({
        clave: k,
        filas: v.map((p) => ({
          id: p.id,
          contenedor: p.contenedor?.nombre ?? null,
          idOrigen: p.idOrigen,
          cobradorId: p.cobradorId,
          creadoEn: p.creadoEn.toISOString(),
        })),
      }));

    return NextResponse.json({
      creadosDesdeElDia17: recientes.map((p) => ({
        id: p.id,
        persona: p.persona,
        fecha: p.fecha.toISOString().slice(0, 10),
        importeEur: p.importeEur ? Number(p.importeEur) : null,
        contenedor: p.contenedor?.nombre ?? null,
        idOrigen: p.idOrigen,
        creadoEn: p.creadoEn.toISOString(),
      })),
      posiblesDuplicados,
    });
  }

  if (accion === "migrar") {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Pago" ADD COLUMN IF NOT EXISTS "fechaHoraBanco" TIMESTAMP(3)`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Contenedor" ADD COLUMN IF NOT EXISTS "inicioBanco" TIMESTAMP(3)`);
    const rellenados = await prisma.$executeRawUnsafe(
      `UPDATE "Pago" SET "fechaHoraBanco" = (to_timestamp(substring("idOrigen" from 13 for 14), 'YYYYMMDDHH24MISS') AT TIME ZONE current_setting('TimeZone'))
       WHERE "fechaHoraBanco" IS NULL AND "idOrigen" ~ '^SABADELL-EB:[0-9]{14}'`
    );
    return NextResponse.json({ ok: true, rellenados });
  }

  return NextResponse.json({ error: "accion no reconocida" }, { status: 400 });
}
