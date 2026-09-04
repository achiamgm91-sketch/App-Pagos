import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { descargarTasasBCE } from "@/lib/importers/tipoCambioBCE";
import { guardarTasasCambio } from "@/lib/tipoCambio";

const USUARIO_CRON = "cron@boomerang";
const FECHA_MINIMA_FALLBACK = "2026-01-01"; // solo se usa si tipoCambioDia está vacío

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const usuarioCron = await prisma.usuario.findUnique({ where: { usuario: USUARIO_CRON } });
  if (!usuarioCron) {
    return NextResponse.json(
      { error: `Usuario de sistema '${USUARIO_CRON}' no encontrado en la tabla Usuario. Créalo antes de activar el cron.` },
      { status: 500 }
    );
  }

  const ultimo = await prisma.tipoCambioDia.aggregate({ _max: { fecha: true } });
  const fechaDesde = ultimo._max.fecha
    ? ultimo._max.fecha.toISOString().slice(0, 10)
    : FECHA_MINIMA_FALLBACK;

  try {
    const tasas = await descargarTasasBCE(fechaDesde);
    const resultado = await guardarTasasCambio(tasas, usuarioCron.id);
    return NextResponse.json({ ok: true, fechaDesde, ...resultado });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Fallo al descargar/guardar tasas del BCE: ${e.message}` },
      { status: 500 }
    );
  }
}
