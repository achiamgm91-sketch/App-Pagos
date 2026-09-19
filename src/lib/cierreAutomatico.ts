import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import { obtenerOcrearUsuarioCron } from "@/lib/usuarioSistema";
import { ORDEN_BANCO_ASC } from "@/lib/pagosBanco";
import { calcularCruce, siguienteNombre } from "@/lib/cruceContenedor";

export const BANCO_AJUSTE = "Ajuste";
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const DIAS_MAX_CRUCE = 10;

export type ResultadoCierre = {
  cerrado: string;
  abierto: string;
  excedente: number;
  moneda: string;
};

/**
 * Los pagos posteriores al corte de un contenedor que hayan quedado en el
 * contenedor anterior (p.ej. por llegar en la misma sincronización) pasan al
 * contenedor con corte. Solo actúa con pagos que tienen hora del banco.
 */
export async function reasignarPagosPorCorte() {
  const contenedores = await prisma.contenedor.findMany({
    select: { id: true, inicioBanco: true },
    orderBy: [{ fechaInicio: "desc" }, { creadoEn: "desc" }],
  });
  let movidos = 0;
  for (let i = 0; i < contenedores.length - 1; i++) {
    const c = contenedores[i];
    if (!c.inicioBanco) continue;
    const anterior = contenedores[i + 1];
    const r = await prisma.pago.updateMany({
      where: {
        contenedorId: anterior.id,
        banco: { not: BANCO_AJUSTE },
        fechaHoraBanco: { gt: c.inicioBanco },
      },
      data: { contenedorId: c.id },
    });
    movidos += r.count;
  }
  return movidos;
}

/**
 * Si lo recibido en el contenedor activo alcanza su total (en la moneda del total
 * factura), lo completa y abre el siguiente. El pago que cruza el total se queda
 * entero en el contenedor que se cierra, con una fila en negativo justo debajo por
 * lo que sobra, y ese sobrante es el saldo inicial del contenedor nuevo.
 */
export async function cerrarContenedorSiCompleto(): Promise<ResultadoCierre | null> {
  const activo = await prisma.contenedor.findFirst({
    where: { estado: "ACTIVO" },
    orderBy: [{ fechaInicio: "desc" }, { creadoEn: "desc" }],
  });
  if (!activo) return null;

  const total = Number(activo.totalFactura);
  if (total <= 0) return null;

  const moneda = activo.monedaTotalFactura === "EUR" ? "EUR" : "USD";
  const importeDe = (p: { importeEur: unknown; importeUsd: unknown }) => {
    const v = moneda === "EUR" ? p.importeEur : p.importeUsd;
    return v === null || v === undefined ? null : Number(v);
  };

  const pagos = await prisma.pago.findMany({
    where: { contenedorId: activo.id },
    orderBy: ORDEN_BANCO_ASC,
  });
  if (pagos.some((p) => p.banco === BANCO_AJUSTE)) return null; // ya se procesó antes

  let saldo = Number(activo.saldoInicial);
  if (activo.monedaSaldoInicial !== moneda && saldo !== 0) {
    const tasaRow = await prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "desc" } });
    if (!tasaRow) return null;
    const tasa = Number(tasaRow.usdPorEur);
    saldo = moneda === "EUR" ? saldo / tasa : saldo * tasa;
  }
  const objetivo = round2(total - saldo);

  const cruce = calcularCruce(
    pagos.map((p) => ({ id: p.id, importe: importeDe(p) })),
    objetivo
  );
  if (!cruce) return null;

  const pagoCruce = pagos[cruce.indice];
  const limite = new Date();
  limite.setDate(limite.getDate() - DIAS_MAX_CRUCE);
  if (pagoCruce.fecha < limite) return null; // cruce antiguo: no reordenar histórico

  const usuarioSistema = await obtenerOcrearUsuarioCron();
  const otraMoneda = moneda === "EUR" ? "importeUsd" : "importeEur";
  const importeCruce = importeDe(pagoCruce) as number;

  const resultado = await prisma.$transaction(async (tx) => {
    const cerrado = await tx.contenedor.updateMany({
      where: { id: activo.id, estado: "ACTIVO" },
      data: { estado: "COMPLETADO", actualizadoPorId: usuarioSistema.id },
    });
    if (cerrado.count === 0) return null; // otro proceso lo cerró a la vez

    const nuevo = await tx.contenedor.create({
      data: {
        nombre: siguienteNombre(activo.nombre),
        saldoInicial: cruce.excedente,
        monedaSaldoInicial: moneda,
        fechaInicio: pagoCruce.fecha,
        inicioBanco: pagoCruce.fechaHoraBanco,
        totalFactura: 0,
        monedaTotalFactura: moneda,
        estado: "ACTIVO",
        creadoPorId: usuarioSistema.id,
        actualizadoPorId: usuarioSistema.id,
      },
    });

    if (cruce.excedente > 0) {
      const fraccion = cruce.excedente / importeCruce;
      const otro = pagoCruce[otraMoneda] !== null ? Number(pagoCruce[otraMoneda]) : null;
      await tx.pago.create({
        data: {
          contenedorId: activo.id,
          fecha: pagoCruce.fecha,
          persona: "Pasa al siguiente contenedor",
          importeEur: moneda === "EUR" ? -cruce.excedente : otro !== null ? -round2(otro * fraccion) : null,
          importeUsd: moneda === "USD" ? -cruce.excedente : otro !== null ? -round2(otro * fraccion) : null,
          tasaCambio: pagoCruce.tasaCambio,
          fechaTasaCambio: pagoCruce.fechaTasaCambio,
          monedaOriginal: pagoCruce.monedaOriginal,
          banco: BANCO_AJUSTE,
          idOrigen: `AJUSTE:${pagoCruce.id}`,
          // 1 ms antes que el pago: en el listado (más reciente primero) queda justo debajo
          fechaHoraBanco: pagoCruce.fechaHoraBanco ? new Date(pagoCruce.fechaHoraBanco.getTime() - 1) : null,
          creadoPorId: usuarioSistema.id,
          actualizadoPorId: usuarioSistema.id,
        },
      });
    }

    return nuevo;
  });

  if (!resultado) return null;

  await reasignarPagosPorCorte();

  await registrarActividad({
    usuarioId: usuarioSistema.id,
    accion: "cierre_automatico",
    entidad: "Contenedor",
    entidadId: activo.id,
    detalle: `"${activo.nombre}" alcanzó su total y se completó; se abrió "${resultado.nombre}" con un saldo inicial de ${cruce.excedente} ${moneda} (lo que sobró del último pago)`,
  });

  return { cerrado: activo.nombre, abierto: resultado.nombre, excedente: cruce.excedente, moneda };
}

/** Se llama tras importar pagos; un fallo aquí nunca debe romper la importación. */
export async function procesarTrasImportar(): Promise<ResultadoCierre | null> {
  try {
    await reasignarPagosPorCorte();
    return await cerrarContenedorSiCompleto();
  } catch (e) {
    console.error("Error en el cierre automático de contenedor:", e);
    return null;
  }
}
