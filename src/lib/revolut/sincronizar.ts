import { prisma } from "@/lib/prisma";
import { obtenerTransaccionesRevolut } from "@/lib/revolut/transacciones";
import { obtenerTasasOrdenadas, buscarTasaConFecha } from "@/lib/tipoCambio";

function fechaISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function restarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

const MARGEN_DIAS_POR_DEFECTO = 5;

export async function calcularFechaSugeridaRevolut(): Promise<string> {
  const contenedor = await prisma.contenedor.findFirst({ where: { estado: "ACTIVO" } });
  const ultimoPago = await prisma.pago.findFirst({
    where: { banco: "Revolut" },
    orderBy: { fecha: "desc" },
  });

  const baseFecha = ultimoPago
    ? fechaISO(ultimoPago.fecha)
    : contenedor
    ? fechaISO(contenedor.fechaInicio)
    : fechaISO(new Date());

  return restarDias(baseFecha, MARGEN_DIAS_POR_DEFECTO);
}

export async function sincronizarPagosRevolut(usuarioId: string, desdeParam?: string) {
  const contenedor = await prisma.contenedor.findFirst({ where: { estado: "ACTIVO" } });
  if (!contenedor) {
    throw new Error("No hay ningún contenedor activo al que asignar los pagos");
  }

  const desde = desdeParam || (await calcularFechaSugeridaRevolut());

  const detectados = await obtenerTransaccionesRevolut(desde);

  const fechaInicioContenedor = fechaISO(contenedor.fechaInicio);
  const dentroDeRango = detectados.filter((d) => d.fecha >= fechaInicioContenedor);
  const anterioresAlInicio = detectados.length - dentroDeRango.length;

  const idsExistentes = new Set(
    (
      await prisma.pago.findMany({
        where: { idOrigen: { in: dentroDeRango.map((d) => d.idOrigen) } },
        select: { idOrigen: true },
      })
    ).map((p) => p.idOrigen)
  );

  const nuevos = dentroDeRango.filter((d) => !idsExistentes.has(d.idOrigen));
  const tasasOrdenadas = await obtenerTasasOrdenadas();

  let sinTasa = 0;
  const pagosNuevos: any[] = [];

  for (const d of nuevos) {
    const encontrada = buscarTasaConFecha(tasasOrdenadas, d.fecha);
    const importeOriginal = round2(d.importe);
    let importeEur: number | null = null;
    let importeUsd: number | null = null;

    if (d.moneda === "EUR") {
      importeEur = importeOriginal;
      importeUsd = encontrada !== null ? round2(importeOriginal * encontrada.valor) : null;
    } else if (d.moneda === "USD") {
      importeUsd = importeOriginal;
      importeEur = encontrada !== null ? round2(importeOriginal / encontrada.valor) : null;
    }
    if (encontrada === null) sinTasa++;

    pagosNuevos.push({
      contenedorId: contenedor.id,
      fecha: new Date(d.fecha),
      persona: d.persona,
      importeEur,
      importeUsd,
      tasaCambio: encontrada?.valor ?? null,
      fechaTasaCambio: encontrada ? new Date(encontrada.fechaTasa) : null,
      monedaOriginal: d.moneda,
      banco: d.banco,
      idOrigen: d.idOrigen,
      creadoPorId: usuarioId,
      actualizadoPorId: usuarioId,
    });
  }

  if (pagosNuevos.length > 0) {
    await prisma.pago.createMany({ data: pagosNuevos, skipDuplicates: true });
  }

  const pagosNuevosResumen = pagosNuevos.map((p) => ({
    persona: p.persona,
    fecha: fechaISO(p.fecha),
    importeEur: p.importeEur,
    importeUsd: p.importeUsd,
  }));

  return {
    contenedor: contenedor.nombre,
    desdeUsado: desde,
    totalRevolut: detectados.length,
    nuevos: pagosNuevos.length,
    duplicados: dentroDeRango.length - nuevos.length,
    anterioresAlInicio,
    sinTasa,
    pagosNuevos: pagosNuevosResumen,
  };
}
