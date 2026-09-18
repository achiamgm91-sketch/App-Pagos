import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/format";

const ESTADOS_LABEL: Record<string, string> = {
  ACTIVO: "Activo",
  COMPLETADO: "Completado",
  FACTURADO: "Facturado",
};

/**
 * Endpoint de solo lectura para que otras apps internas (almacen-app)
 * consulten el estado de pago de los contenedores, sin sesión de usuario de
 * esta app. Protegido por una clave compartida (variable de entorno
 * INTERNO_API_KEY, igual en ambos proyectos de Vercel).
 */
export async function GET(req: NextRequest) {
  const clave = process.env.INTERNO_API_KEY;
  const autorizacion = req.headers.get("authorization");
  if (!clave || autorizacion !== `Bearer ${clave}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const contenedores = await prisma.contenedor.findMany({
    include: { pagos: true },
    orderBy: { creadoEn: "desc" },
  });

  const resultado = contenedores.map((c) => {
    const saldoInicial = Number(c.saldoInicial);
    const totalFactura = Number(c.totalFactura);
    const recibidoUsd = round2(
      saldoInicial + c.pagos.reduce((sum, p) => sum + (p.importeUsd !== null ? Number(p.importeUsd) : 0), 0)
    );
    const porcentajePagado = totalFactura > 0 ? Math.min(Math.round((recibidoUsd / totalFactura) * 100), 100) : 0;

    return {
      nombre: c.nombre,
      codigo: c.codigo,
      estado: c.estado,
      estadoEtiqueta: ESTADOS_LABEL[c.estado] ?? c.estado,
      totalFactura,
      monedaTotalFactura: c.monedaTotalFactura,
      recibidoUsd,
      porcentajePagado,
    };
  });

  return NextResponse.json({ contenedores: resultado });
}
