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
  const pagosContables = pagos.filter((p) => !p.devuelto);

  let saldo = Number(activo.saldoInicial);
  if (activo.monedaSaldoInicial !== moneda && saldo !== 0) {
    const tasaRow = await prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "desc" } });
    if (!tasaRow) return null;
    const tasa = Number(tasaRow.usdPorEur);
    saldo = moneda === "EUR" ? saldo / tasa : saldo * tasa;
  }
  const objetivo = round2(total - saldo);

  const cruce = calcularCruce(
    pagosContables.map((p) => ({ id: p.id, importe: importeDe(p) })),
    objetivo
  );
  if (!cruce) return null;

  const pagoCruce = pagosContables[cruce.indice];
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

export type ResultadoRecuadre = {
  contenedor: string;
  siguiente: string;
  completo: boolean; // false = ni con todo el saldo del siguiente se alcanza el total; no se tocó nada
};

/**
 * Tras marcar o desmarcar una devolución, si el contenedor del pago dio lugar a un
 * corte automático hacia un contenedor siguiente, recalcula dónde debe caer ese
 * corte con el dinero contable actual (sin los pagos devueltos) y reparte los pagos
 * entre ambos contenedores. Si el contenedor no tiene un corte de este tipo (p.ej.
 * transición manual antigua por fecha), no hace nada: el dinero simplemente deja de
 * contar en el total de su contenedor.
 */
export async function recuadrarPorDevolucion(pagoId: string): Promise<ResultadoRecuadre | null> {
  const pagoRef = await prisma.pago.findUnique({ where: { id: pagoId } });
  if (!pagoRef?.contenedorId) return null;

  const contenedor = await prisma.contenedor.findUnique({ where: { id: pagoRef.contenedorId } });
  if (!contenedor) return null;

  const ajuste = await prisma.pago.findFirst({ where: { contenedorId: contenedor.id, banco: BANCO_AJUSTE } });
  if (!ajuste?.idOrigen?.startsWith("AJUSTE:")) return null; // este contenedor no originó un corte: nada que recuadrar

  const pagoCrucePrevio = await prisma.pago.findUnique({ where: { id: ajuste.idOrigen.slice("AJUSTE:".length) } });
  if (!pagoCrucePrevio?.fechaHoraBanco) return null;

  const siguiente = await prisma.contenedor.findFirst({ where: { inicioBanco: pagoCrucePrevio.fechaHoraBanco } });
  if (!siguiente) return null;

  // Seguridad: si el siguiente ya dio lugar a otro corte, no reescribimos varios niveles de la cadena.
  const ajusteSiguiente = await prisma.pago.findFirst({ where: { contenedorId: siguiente.id, banco: BANCO_AJUSTE } });
  if (ajusteSiguiente) return null;

  const moneda = contenedor.monedaTotalFactura === "EUR" ? "EUR" : "USD";
  const importeDe = (p: { importeEur: unknown; importeUsd: unknown }) => {
    const v = moneda === "EUR" ? p.importeEur : p.importeUsd;
    return v === null || v === undefined ? null : Number(v);
  };

  const pool = await prisma.pago.findMany({
    where: { contenedorId: { in: [contenedor.id, siguiente.id] }, banco: { not: BANCO_AJUSTE } },
    orderBy: ORDEN_BANCO_ASC,
  });
  const poolContable = pool.filter((p) => !p.devuelto);

  let saldo = Number(contenedor.saldoInicial);
  if (contenedor.monedaSaldoInicial !== moneda && saldo !== 0) {
    const tasaRow = await prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "desc" } });
    if (!tasaRow) return null;
    const tasa = Number(tasaRow.usdPorEur);
    saldo = moneda === "EUR" ? saldo / tasa : saldo * tasa;
  }
  const objetivo = round2(Number(contenedor.totalFactura) - saldo);

  const cruce = calcularCruce(
    poolContable.map((p) => ({ id: p.id, importe: importeDe(p) })),
    objetivo
  );
  if (!cruce) return { contenedor: contenedor.nombre, siguiente: siguiente.nombre, completo: false };

  const pagoCruce = poolContable[cruce.indice];
  const idxEnPool = pool.findIndex((p) => p.id === pagoCruce.id);
  const idsPosteriores = pool.slice(idxEnPool + 1).map((p) => p.id);
  const usuarioSistema = await obtenerOcrearUsuarioCron();

  await prisma.$transaction(async (tx) => {
    await tx.pago.delete({ where: { id: ajuste.id } });
    await tx.pago.updateMany({ where: { id: { in: pool.map((p) => p.id) } }, data: { contenedorId: contenedor.id } });
    if (idsPosteriores.length > 0) {
      await tx.pago.updateMany({ where: { id: { in: idsPosteriores } }, data: { contenedorId: siguiente.id } });
    }
    await tx.contenedor.update({
      where: { id: siguiente.id },
      data: { inicioBanco: pagoCruce.fechaHoraBanco, saldoInicial: cruce.excedente, monedaSaldoInicial: moneda },
    });

    if (cruce.excedente > 0) {
      const otraMoneda = moneda === "EUR" ? "importeUsd" : "importeEur";
      const importeCruce = importeDe(pagoCruce) as number;
      const otro = pagoCruce[otraMoneda] !== null ? Number(pagoCruce[otraMoneda]) : null;
      const fraccion = cruce.excedente / importeCruce;
      await tx.pago.create({
        data: {
          contenedorId: contenedor.id,
          fecha: pagoCruce.fecha,
          persona: "Pasa al siguiente contenedor",
          importeEur: moneda === "EUR" ? -cruce.excedente : otro !== null ? -round2(otro * fraccion) : null,
          importeUsd: moneda === "USD" ? -cruce.excedente : otro !== null ? -round2(otro * fraccion) : null,
          tasaCambio: pagoCruce.tasaCambio,
          fechaTasaCambio: pagoCruce.fechaTasaCambio,
          monedaOriginal: pagoCruce.monedaOriginal,
          banco: BANCO_AJUSTE,
          idOrigen: `AJUSTE:${pagoCruce.id}`,
          fechaHoraBanco: pagoCruce.fechaHoraBanco ? new Date(pagoCruce.fechaHoraBanco.getTime() - 1) : null,
          creadoPorId: usuarioSistema.id,
          actualizadoPorId: usuarioSistema.id,
        },
      });
    }
  });

  return { contenedor: contenedor.nombre, siguiente: siguiente.nombre, completo: true };
}

export type ResultadoAjusteSaldo = {
  siguiente: string;
  ajuste: number; // negativo = se restó de su saldo inicial, positivo = se sumó (al deshacer)
  moneda: string;
};

/**
 * Para contenedores SIN corte automático (transiciones antiguas por fecha, sin
 * inicioBanco): al marcar o deshacer una devolución, resta o suma el importe del
 * pago (en la moneda del saldo inicial del contenedor siguiente) directamente al
 * saldo inicial de ese contenedor siguiente. Así se recuadra sin mover pagos.
 */
export async function ajustarSaldoInicialSiguiente(pagoId: string, signo: 1 | -1): Promise<ResultadoAjusteSaldo | null> {
  const pago = await prisma.pago.findUnique({ where: { id: pagoId } });
  if (!pago?.contenedorId) return null;

  const contenedor = await prisma.contenedor.findUnique({ where: { id: pago.contenedorId } });
  if (!contenedor) return null;

  const siguiente = await prisma.contenedor.findFirst({
    where: { fechaInicio: { gt: contenedor.fechaInicio } },
    orderBy: { fechaInicio: "asc" },
  });
  if (!siguiente) return null;

  const importe = siguiente.monedaSaldoInicial === "EUR" ? pago.importeEur : pago.importeUsd;
  if (importe === null) return null;

  const delta = -signo * Number(importe);
  const nuevoSaldo = round2(Number(siguiente.saldoInicial) + delta);

  const usuarioSistema = await obtenerOcrearUsuarioCron();
  await prisma.contenedor.update({
    where: { id: siguiente.id },
    data: { saldoInicial: nuevoSaldo, actualizadoPorId: usuarioSistema.id },
  });

  return { siguiente: siguiente.nombre, ajuste: round2(delta), moneda: siguiente.monedaSaldoInicial };
}
