import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recuadrarContenedorConSiguiente } from "@/lib/cierreAutomatico";

const CONTENEDOR_11_ID = "cmtr44cp30001rgviarvjddjx";
const CONTENEDOR_12_ID_ESPERADO = "cmua2d4d5000987dkbq414joi";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.DIAG_SECRET || auth !== `Bearer ${process.env.DIAG_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Comprobacion de seguridad antes de mutar nada: confirmar que el pago que
  // origino el corte 11->12 tiene fechaHoraBanco (viene de Revolut, a diferencia
  // del caso 12->13 que era una alta manual sin hora), y que esa hora identifica
  // sin ambiguedad al Contenedor 12 como "el siguiente".
  const ajuste = await prisma.pago.findFirst({ where: { contenedorId: CONTENEDOR_11_ID, banco: "Ajuste" } });
  if (!ajuste?.idOrigen?.startsWith("AJUSTE:")) {
    return NextResponse.json({ error: "Contenedor 11 no tiene fila de Ajuste que recuadrar" }, { status: 400 });
  }
  const pagoCruce = await prisma.pago.findUnique({ where: { id: ajuste.idOrigen.slice("AJUSTE:".length) } });
  if (!pagoCruce?.fechaHoraBanco) {
    return NextResponse.json({ error: "El pago que origino el corte no tiene fechaHoraBanco; no es seguro usar la funcion generica" }, { status: 400 });
  }
  const candidatos = await prisma.contenedor.findMany({ where: { inicioBanco: pagoCruce.fechaHoraBanco } });
  if (candidatos.length !== 1 || candidatos[0].id !== CONTENEDOR_12_ID_ESPERADO) {
    return NextResponse.json(
      { error: "La busqueda de 'el contenedor siguiente' no da el resultado esperado (Contenedor 12 unico); abortado por seguridad", candidatos: candidatos.map((c) => c.nombre) },
      { status: 400 }
    );
  }

  const pasos = await recuadrarContenedorConSiguiente(CONTENEDOR_11_ID);
  return NextResponse.json({ ok: true, pasos });
}
