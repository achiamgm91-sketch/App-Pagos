import { prisma } from "@/lib/prisma";
import { obtenerTransaccionesSabadell } from "./transacciones";
import { obtenerTasasOrdenadas, buscarTasaConFecha } from "@/lib/tipoCambio";
import { filtrarPagosNuevos } from "@/lib/dedupPagos";
import { cargarCadenaContenedores, elegirContenedor, completarHorasBanco } from "@/lib/pagosBanco";

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

export async function calcularFechaSugeridaSabadell(): Promise<string> {
  const contenedor = await prisma.contenedor.findFirst({ where: { estado: "ACTIVO" } });
  const baseFecha = contenedor ? fechaISO(contenedor.fechaInicio) : fechaISO(new Date());

  // Siempre se revisa desde el inicio del contenedor activo (no solo desde el
  // último pago importado), para detectar pagos antiguos que se hayan quedado
  // sin importar. La deduplicación por idOrigen evita crear pagos repetidos.
  return restarDias(baseFecha, MARGEN_DIAS_POR_DEFECTO);
}

export async function sincronizarPagosSabadell(usuarioId: string, desdeParam?: string) {
  const contenedor = await prisma.contenedor.findFirst({ where: { estado: "ACTIVO" } });
  if (!contenedor) {
    throw new Error("No hay ningún contenedor activo al que asignar los pagos");
  }

  const desde = desdeParam || (await calcularFechaSugeridaSabadell());

  const detectados = await obtenerTransaccionesSabadell(desde);

  const cadena = await cargarCadenaContenedores();
  const asignados = detectados.map((d) => ({
    ...d,
    importe: round2(d.importe),
    contenedorDestino: elegirContenedor(cadena, d),
  }));
  const dentroDeRango = asignados.filter((d) => d.contenedorDestino);
  const anterioresAlInicio = detectados.length - dentroDeRango.length;

  await completarHorasBanco(detectados);
  const nuevos = await filtrarPagosNuevos(dentroDeRango);
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
      contenedorId: d.contenedorDestino!.id,
      fecha: new Date(d.fecha),
      persona: d.persona,
      importeEur,
      importeUsd,
      tasaCambio: encontrada?.valor ?? null,
      fechaTasaCambio: encontrada ? new Date(encontrada.fechaTasa) : null,
      monedaOriginal: d.moneda,
      banco: d.banco,
      idOrigen: d.idOrigen,
      fechaHoraBanco: d.fechaHoraBanco ? new Date(d.fechaHoraBanco) : null,
      creadoPorId: usuarioId,
      actualizadoPorId: usuarioId,
    });
  }

  if (pagosNuevos.length > 0) {
    await prisma.pago.createMany({ data: pagosNuevos, skipDuplicates: true });
  }

  const pagosNuevosResumen = pagosNuevos.map((p, i) => ({
    contenedor: nuevos[i].contenedorDestino!.nombre,
    persona: p.persona,
    fecha: fechaISO(p.fecha),
    importeEur: p.importeEur,
    importeUsd: p.importeUsd,
  }));

  return {
    contenedor: contenedor.nombre,
    desdeUsado: desde,
    totalSabadell: detectados.length,
    nuevos: pagosNuevos.length,
    duplicados: dentroDeRango.length - nuevos.length,
    anterioresAlInicio,
    sinTasa,
    pagosNuevos: pagosNuevosResumen,
  };
}
