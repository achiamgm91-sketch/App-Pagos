import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import { obtenerOcrearUsuarioCron } from "@/lib/usuarioSistema";
import { ORDEN_BANCO_ASC } from "@/lib/pagosBanco";
import { calcularCruce, siguienteNombre, extraerNumeroContenedor } from "@/lib/cruceContenedor";

export const BANCO_AJUSTE = "Ajuste";
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const DIAS_MAX_CRUCE = 10;

type PagoParaAjuste = {
  id: string;
  fecha: Date;
  tasaCambio: Prisma.Decimal | null;
  fechaTasaCambio: Date | null;
  monedaOriginal: string;
  importeEur: Prisma.Decimal | null;
  importeUsd: Prisma.Decimal | null;
  fechaHoraBanco: Date | null;
};

/**
 * Crea, dentro de una transacción, la fila "Pasa al siguiente contenedor" (en
 * negativo, justo debajo del pago que cruza) y deja el sobrante como saldo
 * inicial + corte del contenedor siguiente. Compartida por el cierre
 * automático y por el recuadre tras una devolución, que hacían exactamente
 * lo mismo por separado.
 */
async function aplicarCruce(
  tx: Prisma.TransactionClient,
  contenedorOrigenId: string,
  siguienteId: string,
  pagoCruce: PagoParaAjuste,
  excedente: number,
  moneda: "EUR" | "USD",
  usuarioSistemaId: string
) {
  await tx.contenedor.update({
    where: { id: siguienteId },
    data: { inicioBanco: pagoCruce.fechaHoraBanco, saldoInicial: excedente, monedaSaldoInicial: moneda },
  });

  if (excedente <= 0) return;

  const otraMoneda = moneda === "EUR" ? "importeUsd" : "importeEur";
  const importeCruce = Number(moneda === "EUR" ? pagoCruce.importeEur : pagoCruce.importeUsd);
  const otro = pagoCruce[otraMoneda] !== null ? Number(pagoCruce[otraMoneda]) : null;
  const fraccion = excedente / importeCruce;

  await tx.pago.create({
    data: {
      contenedorId: contenedorOrigenId,
      fecha: pagoCruce.fecha,
      persona: "Pasa al siguiente contenedor",
      importeEur: moneda === "EUR" ? -excedente : otro !== null ? -round2(otro * fraccion) : null,
      importeUsd: moneda === "USD" ? -excedente : otro !== null ? -round2(otro * fraccion) : null,
      tasaCambio: pagoCruce.tasaCambio,
      fechaTasaCambio: pagoCruce.fechaTasaCambio,
      monedaOriginal: pagoCruce.monedaOriginal,
      banco: BANCO_AJUSTE,
      idOrigen: `AJUSTE:${pagoCruce.id}`,
      // 1 ms antes que el pago: en el listado (más reciente primero) queda justo debajo
      fechaHoraBanco: pagoCruce.fechaHoraBanco ? new Date(pagoCruce.fechaHoraBanco.getTime() - 1) : null,
      creadoPorId: usuarioSistemaId,
      actualizadoPorId: usuarioSistemaId,
    },
  });
}

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
  if (pagoCruce.fecha < limite) {
    // El pago que cruza el total es demasiado antiguo (probable cron caído varios
    // días): no reordenamos histórico solo, pero lo dejamos anotado para que se
    // revise a mano, en vez de fallar en silencio.
    const usuarioSistema = await obtenerOcrearUsuarioCron();
    await registrarActividad({
      usuarioId: usuarioSistema.id,
      accion: "cierre_automatico_pendiente",
      entidad: "Contenedor",
      entidadId: activo.id,
      detalle: `"${activo.nombre}" ya alcanzó su total, pero el pago que lo completa es de hace más de ${DIAS_MAX_CRUCE} días (${pagoCruce.fecha.toISOString().slice(0, 10)}); hay que completarlo a mano.`,
    });
    return null;
  }

  const usuarioSistema = await obtenerOcrearUsuarioCron();

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

    await aplicarCruce(tx, activo.id, nuevo.id, pagoCruce, cruce.excedente, moneda, usuarioSistema.id);

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

const PROFUNDIDAD_MAX_CADENA = 25; // salvaguarda; en la práctica la cadena real nunca llega a esto

/**
 * Tras marcar o desmarcar una devolución, si el contenedor del pago dio lugar a un
 * corte automático hacia un contenedor siguiente, recalcula dónde debe caer ese
 * corte con el dinero contable actual (sin los pagos devueltos) y reparte los pagos
 * entre ambos contenedores. Si ese contenedor siguiente, a su vez, ya había dado
 * lugar a otro corte más adelante, se sigue recalculando en cadena hasta que un
 * contenedor no tenga corte que recomponer (p.ej. es el activo, o se cerró a mano
 * por fecha). Si el contenedor de partida no tiene un corte de este tipo (p.ej.
 * transición manual antigua por fecha), no hace nada: el dinero simplemente deja de
 * contar en el total de su contenedor.
 */
export async function recuadrarPorDevolucion(pagoId: string): Promise<ResultadoRecuadre[]> {
  const pagoRef = await prisma.pago.findUnique({ where: { id: pagoId } });
  if (!pagoRef?.contenedorId) return [];
  return recuadrarContenedorConSiguiente(pagoRef.contenedorId);
}

/**
 * Igual que recuadrarPorDevolucion, pero a partir del contenedor directamente (no de
 * un pago concreto). Se usa para seguir la cadena cuando un contenedor cambia de
 * dinero disponible (p.ej. le ajustamos el saldo inicial) y él mismo ya había dado
 * lugar a otro corte más adelante. Devuelve un paso por cada corte recalculado, en
 * orden; una vez que un contenedor no tiene corte que recomponer, la cadena se para.
 */
export async function recuadrarContenedorConSiguiente(
  contenedorId: string,
  profundidad = 0
): Promise<ResultadoRecuadre[]> {
  if (profundidad >= PROFUNDIDAD_MAX_CADENA) return [];

  const contenedor = await prisma.contenedor.findUnique({ where: { id: contenedorId } });
  if (!contenedor) return [];

  const ajuste = await prisma.pago.findFirst({ where: { contenedorId: contenedor.id, banco: BANCO_AJUSTE } });
  if (!ajuste?.idOrigen?.startsWith("AJUSTE:")) return []; // este contenedor no originó un corte: nada que recuadrar

  const pagoCrucePrevio = await prisma.pago.findUnique({ where: { id: ajuste.idOrigen.slice("AJUSTE:".length) } });
  if (!pagoCrucePrevio?.fechaHoraBanco) return [];

  const siguiente = await prisma.contenedor.findFirst({ where: { inicioBanco: pagoCrucePrevio.fechaHoraBanco } });
  if (!siguiente) return [];

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
    if (!tasaRow) return [];
    const tasa = Number(tasaRow.usdPorEur);
    saldo = moneda === "EUR" ? saldo / tasa : saldo * tasa;
  }
  const objetivo = round2(Number(contenedor.totalFactura) - saldo);

  const cruce = calcularCruce(
    poolContable.map((p) => ({ id: p.id, importe: importeDe(p) })),
    objetivo
  );
  if (!cruce) return [{ contenedor: contenedor.nombre, siguiente: siguiente.nombre, completo: false }];

  const pagoCruce = poolContable[cruce.indice];
  const idxEnPool = pool.findIndex((p) => p.id === pagoCruce.id);
  const idsPosteriores = pool.slice(idxEnPool + 1).map((p) => p.id);
  const usuarioSistema = await obtenerOcrearUsuarioCron();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.pago.delete({ where: { id: ajuste.id } });
      await tx.pago.updateMany({ where: { id: { in: pool.map((p) => p.id) } }, data: { contenedorId: contenedor.id } });
      if (idsPosteriores.length > 0) {
        await tx.pago.updateMany({ where: { id: { in: idsPosteriores } }, data: { contenedorId: siguiente.id } });
      }
      await aplicarCruce(tx, contenedor.id, siguiente.id, pagoCruce, cruce.excedente, moneda, usuarioSistema.id);
    });
  } catch (e: any) {
    // P2025 = el registro que queríamos borrar/actualizar ya no existía: otra
    // devolución concurrente sobre el mismo contenedor llegó primero. No hay nada
    // que recuadrar aquí; quien la disparó puede reintentarlo si hace falta.
    if (e?.code === "P2025") {
      console.error("recuadrarContenedorConSiguiente: carrera detectada, se reintentará por separado", {
        contenedorId: contenedor.id,
      });
      return [{ contenedor: contenedor.nombre, siguiente: siguiente.nombre, completo: false }];
    }
    throw e;
  }

  const pasoActual: ResultadoRecuadre = { contenedor: contenedor.nombre, siguiente: siguiente.nombre, completo: true };
  const pasosSiguientes = await recuadrarContenedorConSiguiente(siguiente.id, profundidad + 1);
  return [pasoActual, ...pasosSiguientes];
}

export type ResultadoAjusteSaldo = {
  siguienteId: string;
  siguiente: string;
  ajuste: number; // negativo = se restó de su saldo inicial, positivo = se sumó (al deshacer)
  moneda: string;
};

/**
 * Busca "el contenedor siguiente" de una secuencia numerada ("Contenedor 8" ->
 * "Contenedor 9"), no simplemente el que tenga la fecha de inicio más próxima:
 * puede haber contenedores sueltos sin numerar intercalados (p.ej. un envío
 * especial de una sola vez) que no forman parte de la secuencia principal y no
 * deberían recibir un ajuste pensado para el siguiente número.
 * Si el contenedor de partida no tiene número en el nombre, no hay secuencia
 * clara a la que anclarse: se usa como último recurso el siguiente por fecha.
 */
async function buscarContenedorSiguienteEnSecuencia(contenedor: { id: string; nombre: string; fechaInicio: Date }) {
  const numeroActual = extraerNumeroContenedor(contenedor.nombre);
  const posteriores = await prisma.contenedor.findMany({
    where: { fechaInicio: { gt: contenedor.fechaInicio } },
    orderBy: [{ fechaInicio: "asc" }, { creadoEn: "asc" }],
  });

  if (numeroActual !== null) {
    const numerados = posteriores
      .map((c) => ({ c, n: extraerNumeroContenedor(c.nombre) }))
      .filter((x): x is { c: (typeof posteriores)[number]; n: number } => x.n !== null && x.n > numeroActual)
      .sort((a, b) => a.n - b.n);
    if (numerados.length > 0) return numerados[0].c;
  }

  // Sin número que seguir (o ninguno posterior numerado): mejor esfuerzo por fecha.
  return posteriores[0] ?? null;
}

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

  const siguiente = await buscarContenedorSiguienteEnSecuencia(contenedor);
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

  return { siguienteId: siguiente.id, siguiente: siguiente.nombre, ajuste: round2(delta), moneda: siguiente.monedaSaldoInicial };
}
