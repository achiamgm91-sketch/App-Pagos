import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import {
  recuadrarPorDevolucion,
  recuadrarContenedorConSiguiente,
  ajustarSaldoInicialSiguiente,
  cerrarContenedorSiCompleto,
} from "@/lib/cierreAutomatico";

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

  // Encadena todos los cortes automáticos afectados, empezando por el contenedor
  // del propio pago. Si ese contenedor no tiene corte, se resta/suma del saldo
  // inicial del siguiente contenedor (transición manual por fecha) y, a partir de
  // ahí, se sigue encadenando por si ese siguiente ya tenía su propio corte.
  let pasos = await recuadrarPorDevolucion(params.id);
  const ajusteSaldo = pasos.length === 0 ? await ajustarSaldoInicialSiguiente(params.id, nuevoEstado ? 1 : -1) : null;
  if (ajusteSaldo) {
    pasos = await recuadrarContenedorConSiguiente(ajusteSaldo.siguienteId);
  }
  if (!nuevoEstado && pasos.length === 0 && !ajusteSaldo) {
    // Al deshacer una devolución en el contenedor activo, puede que ahora sí alcance su total.
    await cerrarContenedorSiCompleto().catch(() => null);
  }

  const incompleto = pasos.find((p) => !p.completo);
  const detalleCadena = ajusteSaldo
    ? ` se ${ajusteSaldo.ajuste < 0 ? "restó" : "sumó"} ${Math.abs(ajusteSaldo.ajuste)} ${ajusteSaldo.moneda} al saldo inicial de "${ajusteSaldo.siguiente}".`
    : "";
  const detalleRecuadre =
    pasos.length === 0 && !ajusteSaldo
      ? ""
      : ` —${detalleCadena}${
          pasos.length > 0
            ? ` recuadrado en cadena por: ${pasos.map((p) => `${p.contenedor} → ${p.siguiente}`).join(", ")}.`
            : ""
        }${incompleto ? ` OJO: no se pudo recuadrar del todo entre "${incompleto.contenedor}" y "${incompleto.siguiente}", revisar a mano.` : ""}`;

  await registrarActividad({
    usuarioId,
    accion: nuevoEstado ? "devolver_pago" : "deshacer_devolucion_pago",
    entidad: "Pago",
    entidadId: pago.id,
    detalle: `${pago.persona} (${pago.fecha.toISOString().slice(0, 10)})${detalleRecuadre}`,
  });

  return NextResponse.json({ pago: actualizado, pasos, ajusteSaldo });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if ((session.user as any).rol !== "SUPERADMIN") {
    return NextResponse.json({ error: "Solo un superadministrador puede editar la nota" }, { status: 403 });
  }

  const pago = await prisma.pago.findUnique({ where: { id: params.id } });
  if (!pago) {
    return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
  }
  if (!pago.devuelto) {
    return NextResponse.json({ error: "Este pago no está marcado como devuelto" }, { status: 400 });
  }

  const body = await req.json();
  const nota = typeof body.nota === "string" ? body.nota.trim().slice(0, 500) : "";

  const actualizado = await prisma.pago.update({
    where: { id: params.id },
    data: { devueltoNota: nota || null, actualizadoPorId: (session.user as any).id },
  });

  return NextResponse.json({ pago: actualizado });
}
