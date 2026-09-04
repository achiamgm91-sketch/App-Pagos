import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/format";
import { TasaDetectada } from "./importers/tipoCambio";

export type TasaOrdenada = { fecha: string; valor: number };
export type TasaEncontrada = { valor: number; fechaTasa: string } | null;

export function fechaISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function obtenerTasasOrdenadas(): Promise<TasaOrdenada[]> {
  const filas = await prisma.tipoCambioDia.findMany({ orderBy: { fecha: "asc" } });
  return filas.map((f) => ({ fecha: fechaISO(f.fecha), valor: Number(f.usdPorEur) }));
}

export function buscarTasaConFecha(tasasOrdenadas: TasaOrdenada[], fecha: string): TasaEncontrada {
  const exacta = tasasOrdenadas.find((t) => t.fecha === fecha);
  if (exacta) return { valor: exacta.valor, fechaTasa: exacta.fecha };

  const anteriores = tasasOrdenadas.filter((t) => t.fecha < fecha);
  if (anteriores.length === 0) return null;

  const masCercana = anteriores[anteriores.length - 1];
  return { valor: masCercana.valor, fechaTasa: masCercana.fecha };
}

export async function recalcularPagosConTasaMejorable(usuarioId: string): Promise<number> {
  const tasasOrdenadas = await obtenerTasasOrdenadas();
  if (tasasOrdenadas.length === 0) return 0;

  const todosPagos = await prisma.pago.findMany();
  let actualizados = 0;

  for (const pago of todosPagos) {
    const fechaPago = fechaISO(pago.fecha);
    const fechaTasaActual = pago.fechaTasaCambio ? fechaISO(pago.fechaTasaCambio) : null;
    const valorTasaActual = pago.tasaCambio !== null ? Number(pago.tasaCambio) : null;

    const encontrada = buscarTasaConFecha(tasasOrdenadas, fechaPago);
    if (!encontrada) continue;

    const mismaFecha = fechaTasaActual === encontrada.fechaTasa;
    const mismoValor = valorTasaActual !== null && valorTasaActual === encontrada.valor;
    if (mismaFecha && mismoValor) continue; // ya está al día, nada que hacer

    const data: Record<string, any> = {
      tasaCambio: encontrada.valor,
      fechaTasaCambio: new Date(encontrada.fechaTasa),
      actualizadoPorId: usuarioId,
    };

    if (pago.monedaOriginal === "USD") {
      data.importeEur = round2(Number(pago.importeUsd) / encontrada.valor);
    } else {
      data.importeUsd = round2(Number(pago.importeEur) * encontrada.valor);
    }

    await prisma.pago.update({ where: { id: pago.id }, data });
    actualizados++;
  }

  return actualizados;
}

export type ResultadoGuardadoTasas = {
  totalFichero: number;
  nuevos: number;
  actualizados: number;
  existentes: number;
  ultimaFecha: string | null;
  pagosRecalculados: number;
};

export async function guardarTasasCambio(
  tasas: TasaDetectada[],
  usuarioId: string
): Promise<ResultadoGuardadoTasas> {
  if (tasas.length === 0) {
    const ultimo = await prisma.tipoCambioDia.aggregate({ _max: { fecha: true } });
    return {
      totalFichero: 0,
      nuevos: 0,
      actualizados: 0,
      existentes: 0,
      ultimaFecha: ultimo._max.fecha ? fechaISO(ultimo._max.fecha) : null,
      pagosRecalculados: 0,
    };
  }

  const existentes = await prisma.tipoCambioDia.findMany({
    where: { fecha: { in: tasas.map((t) => new Date(t.fecha)) } },
    select: { fecha: true, usdPorEur: true },
  });
  const existentesMap = new Map(existentes.map((e) => [fechaISO(e.fecha), Number(e.usdPorEur)]));

  const nuevas = tasas.filter((t) => !existentesMap.has(t.fecha));
  const aActualizar = tasas.filter((t) => {
    const actual = existentesMap.get(t.fecha);
    return actual !== undefined && actual !== t.usdPorEur;
  });

  if (nuevas.length > 0) {
    await prisma.tipoCambioDia.createMany({
      data: nuevas.map((t) => ({
        fecha: new Date(t.fecha),
        usdPorEur: t.usdPorEur,
        creadoPorId: usuarioId,
        actualizadoPorId: usuarioId,
      })),
      skipDuplicates: true,
    });
  }

  for (const t of aActualizar) {
    await prisma.tipoCambioDia.update({
      where: { fecha: new Date(t.fecha) },
      data: { usdPorEur: t.usdPorEur, actualizadoPorId: usuarioId },
    });
  }

  const ultimo = await prisma.tipoCambioDia.aggregate({ _max: { fecha: true } });
  const pagosRecalculados = await recalcularPagosConTasaMejorable(usuarioId);

  return {
    totalFichero: tasas.length,
    nuevos: nuevas.length,
    actualizados: aActualizar.length,
    existentes: tasas.length - nuevas.length - aActualizar.length,
    ultimaFecha: ultimo._max.fecha ? fechaISO(ultimo._max.fecha) : null,
    pagosRecalculados,
  };
}
