// Herramienta permanente de SUPERADMIN (nacida como corrección puntual del
// Contenedor 13, que se marcó "Completado" a mano sin mover sus pagos):
// recalcula el pago real que cruza el total del contenedor de origen (en
// orden de banco, igual que el cierre automático) y, solo si se confirma,
// lo cierra, sustituye cualquier fila de Ajuste antigua que ya tuviera, suma
// el excedente al saldo inicial del destino (sin pisarlo) y le reasigna los
// pagos posteriores al que cruza.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import { obtenerOcrearUsuarioCron } from "@/lib/usuarioSistema";
import { ORDEN_BANCO_ASC } from "@/lib/pagosBanco";
import { calcularCruce } from "@/lib/cruceContenedor";
import { BANCO_AJUSTE } from "@/lib/cierreAutomatico";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const NOMBRE_ORIGEN_DEFECTO = "Contenedor 13";
const NOMBRE_DESTINO_DEFECTO = "Arroz Boomerang 2";

// Se sigue la cadena real paso a paso (13 → Arroz Boomerang 2 → Arroz Boomerang 3), no
// se salta directamente al contenedor activo: si el origen (p.ej. Arroz Boomerang 2) ya
// recibió este dinero de más, a él también le toca pasar lo que sobre al siguiente.
async function calcular(nombreOrigen: string, nombreDestino: string) {
  const origen = await prisma.contenedor.findFirst({ where: { nombre: nombreOrigen } });
  if (!origen) throw new Error(`No existe "${nombreOrigen}"`);

  const destino = await prisma.contenedor.findFirst({ where: { nombre: nombreDestino } });
  if (!destino) throw new Error(`No existe "${nombreDestino}"`);
  if (destino.id === origen.id) throw new Error("Origen y destino no pueden ser el mismo contenedor.");

  const total = Number(origen.totalFactura);
  const moneda = origen.monedaTotalFactura === "EUR" ? "EUR" : "USD";
  const importeDe = (p: { importeEur: unknown; importeUsd: unknown }) => {
    const v = moneda === "EUR" ? p.importeEur : p.importeUsd;
    return v === null || v === undefined ? null : Number(v);
  };

  const pagos = await prisma.pago.findMany({ where: { contenedorId: origen.id }, orderBy: ORDEN_BANCO_ASC });
  // Ya existe una fila de Ajuste de un cierre anterior (6/10), legítimo en su momento:
  // el contenedor se reabrió después y siguió recibiendo pagos reales, así que esa fila
  // antigua queda superada. Se excluye del cálculo (no es un pago real) y se sustituye.
  const ajustesPrevios = pagos.filter((p) => p.banco === BANCO_AJUSTE);
  const pagosContables = pagos.filter((p) => !p.devuelto && p.banco !== BANCO_AJUSTE);

  let saldo = Number(origen.saldoInicial);
  if (origen.monedaSaldoInicial !== moneda && saldo !== 0) {
    const tasaRow = await prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "desc" } });
    if (!tasaRow) throw new Error("No hay tipo de cambio guardado");
    const tasa = Number(tasaRow.usdPorEur);
    saldo = moneda === "EUR" ? saldo / tasa : saldo * tasa;
  }
  const objetivo = round2(total - saldo);

  const cruce = calcularCruce(
    pagosContables.map((p) => ({ id: p.id, importe: importeDe(p) })),
    objetivo
  );
  if (!cruce) throw new Error("No se encontró un pago que cruce el total; revisar a mano.");

  const pagoCruce = pagosContables[cruce.indice];
  // Todo lo que venga después del pago que cruza, en el mismo orden de banco, llegó
  // cuando el Contenedor 13 ya debería haber estado cerrado: es dinero real que
  // pertenece al contenedor siguiente, no solo el sobrante del pago que cruza.
  const pagosAReasignar = pagosContables.slice(cruce.indice + 1);
  const sumaAReasignar = round2(pagosAReasignar.reduce((s, p) => s + (importeDe(p) ?? 0), 0));

  const monedaDestino = destino.monedaSaldoInicial === "EUR" ? "EUR" : "USD";
  let excedenteEnMonedaDestino = cruce.excedente;
  if (monedaDestino !== moneda) {
    const tasaRow = await prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "desc" } });
    if (!tasaRow) throw new Error("No hay tipo de cambio guardado para convertir al destino");
    const tasa = Number(tasaRow.usdPorEur);
    excedenteEnMonedaDestino = round2(monedaDestino === "EUR" ? cruce.excedente / tasa : cruce.excedente * tasa);
  }

  const sumaAReasignarUsd = round2(pagosAReasignar.reduce((s, p) => s + (p.importeUsd ? Number(p.importeUsd) : 0), 0));
  const sumaAReasignarEur = round2(pagosAReasignar.reduce((s, p) => s + (p.importeEur ? Number(p.importeEur) : 0), 0));

  return {
    origen,
    estadoOrigenAntes: origen.estado,
    destino,
    moneda,
    objetivo,
    pagoCruce,
    excedente: cruce.excedente,
    monedaDestino,
    excedenteEnMonedaDestino,
    pagosAReasignar,
    numPagosAReasignar: pagosAReasignar.length,
    sumaAReasignarUsd,
    sumaAReasignarEur,
    ajustesPrevios: ajustesPrevios.map((a) => ({
      id: a.id,
      fecha: a.fecha.toISOString().slice(0, 10),
      importeEur: a.importeEur ? Number(a.importeEur) : null,
      importeUsd: a.importeUsd ? Number(a.importeUsd) : null,
      idOrigen: a.idOrigen,
    })),
  };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).rol !== "SUPERADMIN") {
    return NextResponse.json({ error: "Solo un superadministrador" }, { status: 403 });
  }
  const nombreOrigen = req.nextUrl.searchParams.get("origen") || NOMBRE_ORIGEN_DEFECTO;
  const nombreDestino = req.nextUrl.searchParams.get("destino") || NOMBRE_DESTINO_DEFECTO;
  try {
    const r = await calcular(nombreOrigen, nombreDestino);
    return NextResponse.json({
      modo: "SOLO CALCULO, no se ha escrito nada",
      origen: r.origen.nombre,
      estadoOrigenAntes: r.estadoOrigenAntes,
      destino: r.destino.nombre,
      ajustesPreviosQueSeSustituiran: r.ajustesPrevios,
      totalFacturaOrigen: Number(r.origen.totalFactura),
      monedaOrigen: r.moneda,
      pagoQueCruza: {
        id: r.pagoCruce.id,
        persona: r.pagoCruce.persona,
        fecha: r.pagoCruce.fecha.toISOString().slice(0, 10),
        importeEur: r.pagoCruce.importeEur ? Number(r.pagoCruce.importeEur) : null,
        importeUsd: r.pagoCruce.importeUsd ? Number(r.pagoCruce.importeUsd) : null,
        banco: r.pagoCruce.banco,
      },
      excedente: r.excedente,
      monedaDestino: r.monedaDestino,
      excedenteEnMonedaDestino: r.excedenteEnMonedaDestino,
      saldoInicialActualDestino: Number(r.destino.saldoInicial),
      saldoInicialNuevoDestino: round2(Number(r.destino.saldoInicial) + r.excedenteEnMonedaDestino),
      pagosQueSeReasignaran: {
        cuantos: r.numPagosAReasignar,
        sumaUsd: r.sumaAReasignarUsd,
        sumaEur: r.sumaAReasignarEur,
        primerPago: r.pagosAReasignar[0]
          ? { persona: r.pagosAReasignar[0].persona, fecha: r.pagosAReasignar[0].fecha.toISOString().slice(0, 10) }
          : null,
        ultimoPago: r.pagosAReasignar[r.pagosAReasignar.length - 1]
          ? {
              persona: r.pagosAReasignar[r.pagosAReasignar.length - 1].persona,
              fecha: r.pagosAReasignar[r.pagosAReasignar.length - 1].fecha.toISOString().slice(0, 10),
            }
          : null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).rol !== "SUPERADMIN") {
    return NextResponse.json({ error: "Solo un superadministrador" }, { status: 403 });
  }
  const usuarioId = (session.user as any).id as string;
  const nombreOrigen = req.nextUrl.searchParams.get("origen") || NOMBRE_ORIGEN_DEFECTO;
  const nombreDestino = req.nextUrl.searchParams.get("destino") || NOMBRE_DESTINO_DEFECTO;

  try {
    const r = await calcular(nombreOrigen, nombreDestino);
    const usuarioSistema = await obtenerOcrearUsuarioCron();

    const nuevoSaldoDestino = round2(Number(r.destino.saldoInicial) + r.excedenteEnMonedaDestino);

    const resultado = await prisma.$transaction(async (tx) => {
      const cerrado = await tx.contenedor.updateMany({
        where: { id: r.origen.id, estado: r.estadoOrigenAntes },
        data: { estado: "COMPLETADO", actualizadoPorId: usuarioId },
      });
      if (cerrado.count === 0) throw new Error("Otro proceso lo cambió a la vez; no se ha tocado nada.");

      if (r.ajustesPrevios.length > 0) {
        await tx.pago.deleteMany({ where: { id: { in: r.ajustesPrevios.map((a) => a.id) } } });
      }

      await tx.pago.create({
        data: {
          contenedorId: r.origen.id,
          fecha: r.pagoCruce.fecha,
          persona: "Pasa al siguiente contenedor",
          importeEur: r.moneda === "EUR" ? -r.excedente : null,
          importeUsd: r.moneda === "USD" ? -r.excedente : null,
          tasaCambio: r.pagoCruce.tasaCambio,
          fechaTasaCambio: r.pagoCruce.fechaTasaCambio,
          monedaOriginal: r.pagoCruce.monedaOriginal,
          banco: BANCO_AJUSTE,
          idOrigen: `AJUSTE-MANUAL:${r.pagoCruce.id}->${r.destino.id}`,
          fechaHoraBanco: r.pagoCruce.fechaHoraBanco ? new Date(r.pagoCruce.fechaHoraBanco.getTime() - 1) : null,
          creadoPorId: usuarioSistema.id,
          actualizadoPorId: usuarioSistema.id,
        },
      });

      const destinoActualizado = await tx.contenedor.update({
        where: { id: r.destino.id },
        data: { saldoInicial: nuevoSaldoDestino, actualizadoPorId: usuarioId },
      });

      if (r.pagosAReasignar.length > 0) {
        await tx.pago.updateMany({
          where: { id: { in: r.pagosAReasignar.map((p) => p.id) } },
          data: { contenedorId: r.destino.id, actualizadoPorId: usuarioId },
        });
      }

      return destinoActualizado;
    });

    await registrarActividad({
      usuarioId,
      accion: "cierre_automatico",
      entidad: "Contenedor",
      entidadId: r.origen.id,
      detalle: `Corrección manual: "${r.origen.nombre}" se reabrió tras su cierre del 6/10 y acumuló más pagos; se sustituyó la fila de Ajuste antigua (${r.ajustesPrevios.length}) y se completó de nuevo. El excedente de ${r.excedente} ${r.moneda} se sumó al saldo inicial de "${r.destino.nombre}" (quedó en ${nuevoSaldoDestino} ${r.monedaDestino}), y se reasignaron ${r.numPagosAReasignar} pago(s) posteriores (${r.sumaAReasignarUsd} USD / ${r.sumaAReasignarEur} EUR) de "${r.origen.nombre}" a "${r.destino.nombre}".`,
    });

    return NextResponse.json({
      ok: true,
      origenCompletado: r.origen.nombre,
      destino: resultado.nombre,
      excedenteMovido: r.excedente,
      moneda: r.moneda,
      nuevoSaldoInicialDestino: nuevoSaldoDestino,
      pagosReasignados: r.numPagosAReasignar,
      sumaReasignadaUsd: r.sumaAReasignarUsd,
      sumaReasignadaEur: r.sumaAReasignarEur,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
