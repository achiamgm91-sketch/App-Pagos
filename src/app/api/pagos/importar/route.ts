import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectarBancoEnFilasCrudas, filasCrudasAObjetos, bancosSoportados } from "@/lib/importers";
import { esFicheroTipoCambioBDE, procesarTipoCambioBDE } from "@/lib/importers/tipoCambio";
import { obtenerTasasOrdenadas, buscarTasaConFecha, recalcularPagosConTasaMejorable, guardarTasasCambio } from "@/lib/tipoCambio";
import { registrarActividad } from "@/lib/actividad";
import { filtrarPagosNuevos } from "@/lib/dedupPagos";
import Papa from "papaparse";
import * as XLSX from "xlsx";

function fechaISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function normalizarFechasEnGrid(grid: any[][]): any[][] {
  return grid.map((fila) =>
    (fila || []).map((celda) => (celda instanceof Date ? fechaISO(celda) : celda))
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const rol = (session.user as any).rol as string;
  if (!["ADMIN", "SUPERADMIN"].includes(rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const usuarioId = (session.user as any).id as string;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No se ha recibido ningún fichero" }, { status: 400 });
  }

  const nombreFichero = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  let grid: any[][] = [];
  try {
    if (nombreFichero.endsWith(".csv")) {
      const texto = buffer.toString("utf-8");
      const parsed = Papa.parse(texto, { header: false, skipEmptyLines: true });
      grid = parsed.data as any[][];
    } else if (nombreFichero.endsWith(".xlsx") || nombreFichero.endsWith(".xls")) {
      const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      grid = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "", raw: true }) as any[][];
    } else {
      return NextResponse.json(
        { error: "Formato de fichero no soportado. Sube un .csv o .xlsx/.xls" },
        { status: 400 }
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: "No se ha podido leer el fichero. ¿Seguro que es un CSV o Excel válido?" },
      { status: 400 }
    );
  }

  grid = normalizarFechasEnGrid(grid);

  if (grid.length === 0) {
    return NextResponse.json({ error: "El fichero está vacío" }, { status: 400 });
  }

  if (esFicheroTipoCambioBDE(grid)) {
    const tasas = procesarTipoCambioBDE(grid);
    const resultado = await guardarTasasCambio(tasas, usuarioId);
    return NextResponse.json({ tipo: "tipoCambio", ...resultado });
  }

  const deteccion = detectarBancoEnFilasCrudas(grid);
  if (!deteccion) {
    return NextResponse.json(
      {
        error: `No se reconoce el formato de este fichero. Bancos soportados de momento: ${bancosSoportados().join(", ")}. También puedes importar el fichero de tipos de cambio del Banco de España.`,
      },
      { status: 400 }
    );
  }
  const { parser, filaCabeceraIndex } = deteccion;
  const filas = filasCrudasAObjetos(grid, filaCabeceraIndex);

  const contenedor = await prisma.contenedor.findFirst({ where: { estado: "ACTIVO" } });
  if (!contenedor) {
    return NextResponse.json({ error: "No hay ningún contenedor activo al que asignar los pagos" }, { status: 400 });
  }

  const detectados = parser.procesa(filas);

  if (detectados.length === 0) {
    return NextResponse.json({
      tipo: "pagos",
      banco: parser.banco,
      contenedor: contenedor.nombre,
      totalFichero: filas.length,
      nuevos: 0,
      duplicados: 0,
      anterioresAlInicio: 0,
      sinTasa: 0,
      pagosNuevos: [],
    });
  }

  const fechaInicioContenedor = fechaISO(contenedor.fechaInicio);
  const dentroDeRango = detectados.filter((d) => d.fecha >= fechaInicioContenedor);
  const anterioresAlInicio = detectados.length - dentroDeRango.length;

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const nuevos = await filtrarPagosNuevos(
    dentroDeRango.map((d) => ({ ...d, importe: round2(d.importe) }))
  );
  const duplicados = dentroDeRango.length - nuevos.length;

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
    await registrarActividad({
      usuarioId,
      accion: "importar_pagos",
      entidad: "Pago",
      detalle: `Importó ${pagosNuevos.length} pago(s) de ${parser.banco} al contenedor "${contenedor.nombre}"`,
    });
  }

  return NextResponse.json({
    tipo: "pagos",
    banco: parser.banco,
    contenedor: contenedor.nombre,
    totalFichero: filas.length,
    nuevos: pagosNuevos.length,
    duplicados,
    anterioresAlInicio,
    sinTasa,
    pagosNuevos: pagosNuevos.map((p) => ({
      persona: p.persona,
      fecha: fechaISO(p.fecha),
      importeEur: p.importeEur,
      importeUsd: p.importeUsd,
    })),
  });
}
