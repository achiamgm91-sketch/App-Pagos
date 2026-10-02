import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import { obtenerOcrearUsuarioCron } from "@/lib/usuarioSistema";
import { ORDEN_BANCO_ASC } from "@/lib/pagosBanco";
import { calcularCruce } from "@/lib/cruceContenedor";
import { aplicarCruce, BANCO_AJUSTE } from "@/lib/cierreAutomatico";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Vuelve a recuadrar el corte Contenedor 12 -> Contenedor 13, esta vez porque el
// recuadre de Contenedor 11 -> 12 movio dinero y dejo al 12 corto otra vez. Mismo
// motivo que la primera vez para no usar recuadrarContenedorConSiguiente: el pago
// que origino el corte (alta manual de BBVA) no tiene fechaHoraBanco.
const CONTENEDOR_12_ID = "cmua2d4d5000987dkbq414joi";
const CONTENEDOR_13_ID = "cmuprk9w20004woqufz810mf3";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.DIAG_SECRET || auth !== `Bearer ${process.env.DIAG_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const contenedor = await prisma.contenedor.findUnique({ where: { id: CONTENEDOR_12_ID } });
  if (!contenedor) return NextResponse.json({ error: "Contenedor 12 no encontrado" }, { status: 404 });

  const ajuste = await prisma.pago.findFirst({ where: { contenedorId: CONTENEDOR_12_ID, banco: BANCO_AJUSTE } });
  if (!ajuste) return NextResponse.json({ error: "Contenedor 12 no tiene fila de Ajuste que recuadrar" }, { status: 400 });

  const usuarioSistema = await obtenerOcrearUsuarioCron();

  const moneda = contenedor.monedaTotalFactura === "EUR" ? "EUR" : "USD";
  const importeDe = (p: { importeEur: unknown; importeUsd: unknown }) => {
    const v = moneda === "EUR" ? p.importeEur : p.importeUsd;
    return v === null || v === undefined ? null : Number(v);
  };

  const pool = await prisma.pago.findMany({
    where: { contenedorId: { in: [CONTENEDOR_12_ID, CONTENEDOR_13_ID] }, banco: { not: BANCO_AJUSTE } },
    orderBy: ORDEN_BANCO_ASC,
  });
  const poolContable = pool.filter((p) => !p.devuelto);

  let saldo = Number(contenedor.saldoInicial);
  if (contenedor.monedaSaldoInicial !== moneda && saldo !== 0) {
    const tasaRow = await prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "desc" } });
    if (!tasaRow) return NextResponse.json({ error: "Sin tipo de cambio para convertir el saldo inicial" }, { status: 400 });
    const tasa = Number(tasaRow.usdPorEur);
    saldo = moneda === "EUR" ? saldo / tasa : saldo * tasa;
  }
  const objetivo = round2(Number(contenedor.totalFactura) - saldo);

  const cruce = calcularCruce(
    poolContable.map((p) => ({ id: p.id, importe: importeDe(p) })),
    objetivo
  );
  if (!cruce) {
    return NextResponse.json({ error: "Ni con todo el dinero del 12+13 se alcanza el total del 12; no se tocó nada", objetivo }, { status: 400 });
  }

  const pagoCruce = poolContable[cruce.indice];
  const idxEnPool = pool.findIndex((p) => p.id === pagoCruce.id);
  const idsPosteriores = pool.slice(idxEnPool + 1).map((p) => p.id);

  await prisma.$transaction(async (tx) => {
    await tx.pago.delete({ where: { id: ajuste.id } });
    await tx.pago.updateMany({ where: { id: { in: pool.map((p) => p.id) } }, data: { contenedorId: CONTENEDOR_12_ID } });
    if (idsPosteriores.length > 0) {
      await tx.pago.updateMany({ where: { id: { in: idsPosteriores } }, data: { contenedorId: CONTENEDOR_13_ID } });
    }
    await aplicarCruce(tx, CONTENEDOR_12_ID, CONTENEDOR_13_ID, pagoCruce, cruce.excedente, moneda, usuarioSistema.id);
  });

  await registrarActividad({
    usuarioId: usuarioSistema.id,
    accion: "recuadre_manual_12_13",
    entidad: "Contenedor",
    entidadId: CONTENEDOR_12_ID,
    detalle: `Recuadre manual Contenedor 12 -> 13 (segunda vez, tras recuadrar el 11->12). Nuevo excedente: ${cruce.excedente} ${moneda}, pago que cruza: "${pagoCruce.persona}" (${pagoCruce.fecha.toISOString().slice(0, 10)}).`,
  });

  return NextResponse.json({
    ok: true,
    objetivo,
    pagoCruce: { id: pagoCruce.id, persona: pagoCruce.persona, fecha: pagoCruce.fecha },
    excedente: cruce.excedente,
    moneda,
    movidosAContenedor13: idsPosteriores.length,
  });
}
