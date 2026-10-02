import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import { obtenerOcrearUsuarioCron } from "@/lib/usuarioSistema";
import { ORDEN_BANCO_ASC } from "@/lib/pagosBanco";
import { calcularCruce } from "@/lib/cruceContenedor";
import { aplicarCruce, BANCO_AJUSTE } from "@/lib/cierreAutomatico";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Recuadra concretamente el corte Contenedor 12 -> Contenedor 13 con los importes
// ya corregidos. Se hace a mano (sin usar recuadrarContenedorConSiguiente) porque
// el pago que origino el corte (alta manual de BBVA) no tiene fechaHoraBanco, y la
// busqueda generica de "el contenedor siguiente" por inicioBanco=null podria
// encontrar cualquier otro contenedor antiguo que tampoco tiene hora de banco.
const CONTENEDOR_12_ID = "cmua2d4d5000987dkbq414joi";
const CONTENEDOR_13_ID = "cmuprk9w20004woqufz810mf3";

// Duplicados puros encontrados al preparar el recuadre: el mismo pago real entró
// dos veces (por la subida manual del Excel en USD, ya corregida en moneda, y por
// Enable Banking, que ya lo traía bien desde el principio). Se borran antes de
// recuadrar para no contar el dinero dos veces.
const IDS_DUPLICADOS = [
  "cmur4xwbx0004yjyqdwkoiz3b", // LEDIER MOLINA ALPIZAR 5000 USD 22/9
  "cmur4xwbx0002yjyq49k4fth3", // PERFORMANCE CONSTRUCTION LTD 100 USD 25/9
  "cmur4xwbx0003yjyqvqwg6wfc", // LOPESANT BUSINESS SERVICES LLC 2523 USD 25/9
  "cmur4xwbx0001yjyq5gunyzwd", // RAISA CRUZ SOSA 3794 USD 2/10
];

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

  const duplicadosBorrados = await prisma.pago.findMany({ where: { id: { in: IDS_DUPLICADOS } } });
  if (duplicadosBorrados.length > 0) {
    await prisma.pago.deleteMany({ where: { id: { in: IDS_DUPLICADOS } } });
    await registrarActividad({
      usuarioId: usuarioSistema.id,
      accion: "borrar_duplicados_12_13",
      entidad: "Pago",
      detalle: `Borrados ${duplicadosBorrados.length} pagos duplicados (entraron por la subida manual en USD y ya existían por Enable Banking): ${duplicadosBorrados.map((p) => p.persona).join(", ")}.`,
    });
  }

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
    detalle: `Recuadre manual Contenedor 12 -> 13 tras corregir 11 pagos con moneda intercambiada. Nuevo excedente: ${cruce.excedente} ${moneda}, pago que cruza: "${pagoCruce.persona}" (${pagoCruce.fecha.toISOString().slice(0, 10)}).`,
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
