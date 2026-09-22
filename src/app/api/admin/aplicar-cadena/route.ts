import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recuadrarContenedorConSiguiente } from "@/lib/cierreAutomatico";

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const nombre = req.nextUrl.searchParams.get("contenedor") || "Contenedor 11";
  const contenedor = await prisma.contenedor.findFirst({ where: { nombre } });
  if (!contenedor) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const resultado = await recuadrarContenedorConSiguiente(contenedor.id);
  return NextResponse.json({ resultado });
}
