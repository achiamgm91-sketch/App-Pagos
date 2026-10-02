import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import { obtenerOcrearUsuarioCron } from "@/lib/usuarioSistema";

// Duplicados encontrados en Contenedor 8 / Paneles Henry: ya existia un dato
// historico (MANUAL:C8:...) con cobrador asignado, y la subida manual (ya
// corregida de moneda) volvio a traer el mismo pago real sin asignar. Se borran
// estas 3 entradas sin cobrador, dejando la fila historica que ya estaba bien.
const IDS_DUPLICADOS = [
  "cmur4xwbx0007yjyqfo75k748", // CARBONELL MULTISERVICE LLC
  "cmur4xwbx0006yjyq9mgys65m", // EVER M MORENO GREGORICH
  "cmur4xwbx0005yjyqumonu0hc", // RAUL RENE ALPIZAR GAMBOA
];

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.DIAG_SECRET || auth !== `Bearer ${process.env.DIAG_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const encontrados = await prisma.pago.findMany({ where: { id: { in: IDS_DUPLICADOS } } });
  if (encontrados.length !== IDS_DUPLICADOS.length) {
    return NextResponse.json({ error: "No se encontraron todos los pagos esperados", encontrados: encontrados.length }, { status: 400 });
  }
  if (encontrados.some((p) => p.cobradorId !== null)) {
    return NextResponse.json({ error: "Alguno de estos pagos SI tiene cobrador asignado; no se borra nada por seguridad" }, { status: 400 });
  }

  await prisma.pago.deleteMany({ where: { id: { in: IDS_DUPLICADOS } } });

  const usuarioSistema = await obtenerOcrearUsuarioCron();
  await registrarActividad({
    usuarioId: usuarioSistema.id,
    accion: "borrar_duplicados_contenedor8",
    entidad: "Pago",
    detalle: `Borrados ${encontrados.length} pagos duplicados sin asignar (Carbonell Multiservice, Ever M. Moreno Gregorich, Raul Rene Alpizar) que ya existian en el sistema con otro idOrigen histórico y cobrador asignado.`,
  });

  return NextResponse.json({ ok: true, borrados: encontrados.map((p) => ({ id: p.id, persona: p.persona })) });
}
