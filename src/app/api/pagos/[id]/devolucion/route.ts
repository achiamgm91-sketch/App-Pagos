import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import { recuadrarPorDevolucion, ajustarSaldoInicialSiguiente, cerrarContenedorSiCompleto } from "@/lib/cierreAutomatico";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if ((session.user as any).rol !== "SUPERADMIN") {
    return NextResponse.json({ error: "Solo un superadministrador puede registrar devoluciones" }, { status: 403 });
  }
  const usuarioId = (session.user as any).id as string;

  const pago = await prisma.pago.findUnique({ where: { id: params.id } });
  if (!pago) {
    return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
  }
  if (pago.banco === "Ajuste") {
    return NextResponse.json({ error: "Esta fila es un ajuste interno, no se puede devolver" }, { status: 400 });
  }

  const nuevoEstado = !pago.devuelto;

  const actualizado = await prisma.pago.update({
    where: { id: params.id },
    data: {
      devuelto: nuevoEstado,
      devueltoEn: nuevoEstado ? new Date() : null,
      devueltoPorId: nuevoEstado ? usuarioId : null,
      actualizadoPorId: usuarioId,
    },
  });

  const recuadre = await recuadrarPorDevolucion(params.id);
  const ajusteSaldo = recuadre ? null : await ajustarSaldoInicialSiguiente(params.id, nuevoEstado ? 1 : -1);
  if (!nuevoEstado && !recuadre) {
    // Al deshacer una devolución en el contenedor activo, puede que ahora sí alcance su total.
    await cerrarContenedorSiCompleto().catch(() => null);
  }

  const detalleRecuadre = recuadre
    ? recuadre.completo
      ? ` — recuadrado con "${recuadre.siguiente}"`
      : ` — no se pudo recuadrar del todo con "${recuadre.siguiente}", revisar a mano`
    : ajusteSaldo
    ? ` — se ${ajusteSaldo.ajuste < 0 ? "restó" : "sumó"} ${Math.abs(ajusteSaldo.ajuste)} ${ajusteSaldo.moneda} al saldo inicial de "${ajusteSaldo.siguiente}"`
    : "";

  await registrarActividad({
    usuarioId,
    accion: nuevoEstado ? "devolver_pago" : "deshacer_devolucion_pago",
    entidad: "Pago",
    entidadId: pago.id,
    detalle: `${pago.persona} (${pago.fecha.toISOString().slice(0, 10)})${detalleRecuadre}`,
  });

  return NextResponse.json({ pago: actualizado, recuadre, ajusteSaldo });
}
