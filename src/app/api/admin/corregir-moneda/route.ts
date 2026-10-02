import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarActividad } from "@/lib/actividad";
import { obtenerOcrearUsuarioCron } from "@/lib/usuarioSistema";

// Corrige el importe de los 11 pagos que entraron con la moneda cambiada
// (el Excel de la cuenta en USD de Sabadell se proceso como si fuera EUR).
// Solo corrige el dato de cada pago (importeEur, importeUsd, monedaOriginal);
// no toca saldoInicial/totalFactura/estado de ningun contenedor, segun lo
// pedido explicitamente.
const CORRECCIONES = [
  { id: "cmur4xwbx0007yjyqfo75k748", importeEur: 13167.13, importeUsd: 15000 },
  { id: "cmur4xwbx0006yjyq9mgys65m", importeEur: 7820.74, importeUsd: 8900 },
  { id: "cmur4xwbx0005yjyqumonu0hc", importeEur: 1950.59, importeUsd: 2250 },
  { id: "cmtsjipch000k74f8iebar6z5", importeEur: 3437.18, importeUsd: 4005 },
  { id: "cmtvbfblr000111d6wexw2evl", importeEur: 2909.37, importeUsd: 3390 },
  { id: "cmtvbfblr000011d68lhqk3ma", importeEur: 7954.56, importeUsd: 9220.93 },
  { id: "cmur4xwbx0004yjyqdwkoiz3b", importeEur: 4361.86, importeUsd: 5000 },
  { id: "cmur4xwbx0002yjyq49k4fth3", importeEur: 87.7, importeUsd: 100 },
  { id: "cmur4xwbx0003yjyqvqwg6wfc", importeEur: 2212.58, importeUsd: 2523 },
  { id: "cmur4xwbx0000yjyq5csrqt1h", importeEur: 11324.93, importeUsd: 12885.5 },
  { id: "cmur4xwbx0001yjyq5gunyzwd", importeEur: 3358.12, importeUsd: 3794 },
];

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.DIAG_SECRET || auth !== `Bearer ${process.env.DIAG_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const usuarioSistema = await obtenerOcrearUsuarioCron();
  const resultado = [];

  for (const c of CORRECCIONES) {
    const antes = await prisma.pago.findUnique({ where: { id: c.id } });
    if (!antes) {
      resultado.push({ id: c.id, error: "no encontrado" });
      continue;
    }
    const actualizado = await prisma.pago.update({
      where: { id: c.id },
      data: {
        importeEur: c.importeEur,
        importeUsd: c.importeUsd,
        monedaOriginal: "USD",
        actualizadoPorId: usuarioSistema.id,
      },
    });
    resultado.push({
      id: c.id,
      persona: antes.persona,
      antes: { importeEur: Number(antes.importeEur), importeUsd: Number(antes.importeUsd) },
      despues: { importeEur: Number(actualizado.importeEur), importeUsd: Number(actualizado.importeUsd) },
    });
  }

  await registrarActividad({
    usuarioId: usuarioSistema.id,
    accion: "corregir_moneda_pagos",
    entidad: "Pago",
    detalle: `Corregidos ${resultado.filter((r) => !("error" in r)).length} pagos que entraron con EUR/USD intercambiados (Excel de la cuenta USD de Sabadell procesado como EUR).`,
  });

  return NextResponse.json({ ok: true, resultado });
}
