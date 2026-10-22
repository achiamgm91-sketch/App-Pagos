// Endpoint temporal de solo lectura: reconstruye qué le ha pasado al
// Contenedor 13 (por qué se quedó con un excedente sin pasar solo al
// siguiente contenedor) a partir del registro de actividad real y su estado
// actual, sin suponer nada.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BANCO_AJUSTE } from "@/lib/cierreAutomatico";

const NOMBRE = "Contenedor 13";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).rol !== "SUPERADMIN") {
    return NextResponse.json({ error: "Solo un superadministrador" }, { status: 403 });
  }

  const contenedor = await prisma.contenedor.findFirst({ where: { nombre: NOMBRE } });
  if (!contenedor) return NextResponse.json({ error: `No existe "${NOMBRE}"` }, { status: 404 });

  const ajustes = await prisma.pago.findMany({
    where: { contenedorId: contenedor.id, banco: BANCO_AJUSTE },
    orderBy: { creadoEn: "asc" },
  });

  const ajustesConCruce = await Promise.all(
    ajustes.map(async (a) => {
      const refId = a.idOrigen?.startsWith("AJUSTE:") ? a.idOrigen.slice("AJUSTE:".length) : null;
      const pagoCruce = refId ? await prisma.pago.findUnique({ where: { id: refId } }) : null;
      const siguientePorHora = pagoCruce?.fechaHoraBanco
        ? await prisma.contenedor.findFirst({ where: { inicioBanco: pagoCruce.fechaHoraBanco } })
        : null;
      return {
        id: a.id,
        fecha: a.fecha.toISOString().slice(0, 10),
        creadoEn: a.creadoEn.toISOString(),
        importeEur: a.importeEur ? Number(a.importeEur) : null,
        importeUsd: a.importeUsd ? Number(a.importeUsd) : null,
        idOrigen: a.idOrigen,
        pagoQueCruzaba: pagoCruce
          ? {
              id: pagoCruce.id,
              persona: pagoCruce.persona,
              fecha: pagoCruce.fecha.toISOString().slice(0, 10),
              fechaHoraBanco: pagoCruce.fechaHoraBanco?.toISOString() ?? null,
              banco: pagoCruce.banco,
            }
          : "NO SE ENCUENTRA (pago borrado o id no coincide)",
        contenedorQueApunta_inicioBanco: siguientePorHora
          ? { id: siguientePorHora.id, nombre: siguientePorHora.nombre }
          : pagoCruce?.fechaHoraBanco
          ? "NINGUNO con ese inicioBanco exacto"
          : "el pago que cruzaba no tiene fechaHoraBanco",
      };
    })
  );

  const todosLosContenedores = await prisma.contenedor.findMany({
    select: { id: true, nombre: true, estado: true, fechaInicio: true, creadoEn: true, inicioBanco: true, saldoInicial: true, monedaSaldoInicial: true, totalFactura: true },
    orderBy: [{ fechaInicio: "asc" }, { creadoEn: "asc" }],
  });

  const actividad = await prisma.registroActividad.findMany({
    where: {
      OR: [{ entidadId: contenedor.id }, { detalle: { contains: NOMBRE } }],
    },
    orderBy: { creadoEn: "asc" },
    take: 100,
    include: { usuario: true },
  });

  const totalPagos = await prisma.pago.count({ where: { contenedorId: contenedor.id } });
  const numAjustes = ajustes.length;

  return NextResponse.json({
    estadoActual: {
      id: contenedor.id,
      nombre: contenedor.nombre,
      estado: contenedor.estado,
      fechaInicio: contenedor.fechaInicio.toISOString().slice(0, 10),
      creadoEn: contenedor.creadoEn.toISOString(),
      inicioBanco: contenedor.inicioBanco?.toISOString() ?? null,
      saldoInicial: Number(contenedor.saldoInicial),
      monedaSaldoInicial: contenedor.monedaSaldoInicial,
      totalFactura: Number(contenedor.totalFactura),
      totalPagos,
      numeroFilasAjuste: numAjustes,
    },
    porQueNoSeCierraSolo:
      contenedor.estado !== "ACTIVO"
        ? `No está ACTIVO (está ${contenedor.estado}) — el cierre automático solo actúa sobre el contenedor activo.`
        : numAjustes > 0
        ? `Ya tiene ${numAjustes} fila(s) de Ajuste — cerrarContenedorSiCompleto() se para en cuanto ve una, asumiendo "ya se procesó antes".`
        : Number(contenedor.totalFactura) <= 0
        ? "Total factura es 0 — no se puede calcular ningún cruce."
        : "Ninguna de las causas conocidas; revisar a mano.",
    filasDeAjusteExistentes: ajustesConCruce,
    todosLosContenedoresOrdenadosPorFecha: todosLosContenedores.map((c) => ({
      nombre: c.nombre,
      estado: c.estado,
      fechaInicio: c.fechaInicio.toISOString().slice(0, 10),
      creadoEn: c.creadoEn.toISOString(),
      inicioBanco: c.inicioBanco?.toISOString() ?? null,
      saldoInicial: Number(c.saldoInicial),
      monedaSaldoInicial: c.monedaSaldoInicial,
      totalFactura: Number(c.totalFactura),
    })),
    actividadRelacionada: actividad.map((a) => ({
      creadoEn: a.creadoEn.toISOString(),
      usuario: a.usuario?.nombre || a.usuario?.usuario || "Sistema",
      accion: a.accion,
      detalle: a.detalle,
    })),
  });
}
