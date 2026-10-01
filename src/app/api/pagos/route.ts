import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { obtenerPagosFiltrados, simplificarPago } from "@/lib/pagosQuery";
import { tienePermiso } from "@/lib/permisos";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import { obtenerTasasOrdenadas, buscarTasaConFecha } from "@/lib/tipoCambio";
import { procesarTrasImportar } from "@/lib/cierreAutomatico";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!tienePermiso((session.user as any).rol, (session.user as any).permisos, "ver_pagos")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1", 10);

  const resultado = await obtenerPagosFiltrados(
    {
      contenedorId: searchParams.get("contenedorId") || "",
      fecha: searchParams.get("fecha") || "",
      nombre: searchParams.get("nombre") || "",
      cobrador: searchParams.get("cobrador") || "",
      monto: searchParams.get("monto") || "",
      moneda: (searchParams.get("moneda") as "EUR" | "USD") || "EUR",
    },
    page
  );

  return NextResponse.json({
    ...resultado,
    pagos: resultado.pagos.map(simplificarPago),
  });
}

// Alta manual de un pago (p.ej. un banco nuevo que todavía no tiene su propio
// importador automático). Solo SUPERADMIN: es una intervención excepcional,
// el dato de quién pagó y cuánto hay que confiárselo a una persona, no a un parser.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).rol !== "SUPERADMIN") {
    return NextResponse.json({ error: "Solo un superadministrador puede añadir pagos a mano" }, { status: 403 });
  }
  const usuarioId = (session.user as any).id as string;

  const body = await req.json();
  const persona = String(body.persona || "").trim();
  const fecha = String(body.fecha || "").trim();
  const importe = parseFloat(body.importe);
  const moneda = body.moneda === "USD" ? "USD" : "EUR";
  const banco = String(body.banco || "").trim();
  const contenedorId = String(body.contenedorId || "").trim();

  if (!persona || !fecha || !importe || importe <= 0 || !banco || !contenedorId) {
    return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
  }

  const contenedor = await prisma.contenedor.findUnique({ where: { id: contenedorId } });
  if (!contenedor) {
    return NextResponse.json({ error: "Contenedor no encontrado" }, { status: 404 });
  }

  const tasasOrdenadas = await obtenerTasasOrdenadas();
  const encontrada = buscarTasaConFecha(tasasOrdenadas, fecha);
  const importeOriginal = round2(importe);
  let importeEur: number | null = null;
  let importeUsd: number | null = null;
  if (moneda === "EUR") {
    importeEur = importeOriginal;
    importeUsd = encontrada !== null ? round2(importeOriginal * encontrada.valor) : null;
  } else {
    importeUsd = importeOriginal;
    importeEur = encontrada !== null ? round2(importeOriginal / encontrada.valor) : null;
  }

  const pago = await prisma.pago.create({
    data: {
      contenedorId,
      fecha: new Date(`${fecha}T00:00:00Z`),
      persona: persona.toUpperCase(),
      importeEur,
      importeUsd,
      tasaCambio: encontrada?.valor ?? null,
      fechaTasaCambio: encontrada ? new Date(encontrada.fechaTasa) : null,
      monedaOriginal: moneda,
      banco,
      idOrigen: `MANUAL:${crypto.randomUUID()}`,
      creadoPorId: usuarioId,
      actualizadoPorId: usuarioId,
    },
  });

  await registrarActividad({
    usuarioId,
    accion: "crear_pago_manual",
    entidad: "Pago",
    entidadId: pago.id,
    detalle: `${pago.persona}, ${importeOriginal} ${moneda} (${banco}) añadido a mano en "${contenedor.nombre}"`,
  });

  const cierre = await procesarTrasImportar();

  return NextResponse.json({ pago, sinTasa: encontrada === null, cierre });
}
