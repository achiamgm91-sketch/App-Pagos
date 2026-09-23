import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { obtenerPagosFiltrados, simplificarPago } from "@/lib/pagosQuery";
import { tienePermiso } from "@/lib/permisos";

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
