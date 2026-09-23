import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import { tienePermiso } from "@/lib/permisos";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !tienePermiso((session.user as any).rol, (session.user as any).permisos, "gestionar_contenedores")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const usuarioId = (session.user as any).id as string;

  const body = await req.json();
  const { nombre, codigo, saldoInicial, monedaSaldoInicial, fechaInicio, totalFactura, monedaTotalFactura, estado, inicioBanco } = body;

  if (!nombre || !fechaInicio || totalFactura === undefined || totalFactura === null) {
    return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
  }

  let inicioBancoDate: Date | null = null;
  if (inicioBanco) {
    inicioBancoDate = new Date(inicioBanco);
    if (isNaN(inicioBancoDate.getTime())) {
      return NextResponse.json({ error: "Fecha y hora de corte inválida" }, { status: 400 });
    }
  }

  try {
    const contenedor = await prisma.contenedor.create({
      data: {
        nombre,
        codigo: codigo && String(codigo).trim() ? String(codigo).trim() : null,
        saldoInicial: saldoInicial ?? 0,
        monedaSaldoInicial: monedaSaldoInicial || "USD",
        fechaInicio: new Date(fechaInicio),
        inicioBanco: inicioBancoDate,
        totalFactura,
        monedaTotalFactura: monedaTotalFactura || "USD",
        estado: estado || "ACTIVO",
        creadoPorId: usuarioId,
        actualizadoPorId: usuarioId,
      },
    });

    await registrarActividad({
      usuarioId,
      accion: "crear_contenedor",
      entidad: "Contenedor",
      entidadId: contenedor.id,
      detalle: `Creó el contenedor "${nombre}"`,
    });

    return NextResponse.json({ contenedor });
  } catch (e: any) {
    if (e.code === "P2002") {
      return NextResponse.json({ error: "Ya existe un contenedor con ese código" }, { status: 400 });
    }
    return NextResponse.json({ error: "Error al crear el contenedor" }, { status: 500 });
  }
}
