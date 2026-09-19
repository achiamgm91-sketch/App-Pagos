import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { round2 } from "@/lib/format";
import { ORDEN_BANCO_DESC, ORDEN_BANCO_ASC } from "@/lib/pagosBanco";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || !["ADMIN", "SUPERADMIN"].includes((session.user as any).rol)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const contenedor = await prisma.contenedor.findUnique({
    where: { id: params.id },
    include: {
      pagos: {
        orderBy: ORDEN_BANCO_ASC,
        include: {
          cobrador: true,
          creadoPor: true,
          actualizadoPor: true,
          cobradorAsignadoPor: true,
        },
      },
    },
  });

  if (!contenedor) {
    return NextResponse.json({ error: "Contenedor no encontrado" }, { status: 404 });
  }

  const saldoInicial = Number(contenedor.saldoInicial);
  const totalFactura = Number(contenedor.totalFactura);
  const pagosConImporte = contenedor.pagos.filter((p) => p.importeUsd !== null);
  const recibido = round2(
    saldoInicial + pagosConImporte.reduce((sum, p) => sum + Number(p.importeUsd), 0)
  );
  const falta = round2(Math.max(totalFactura - recibido, 0));

  const resumen = [
    ["Contenedor", contenedor.nombre],
    ["Código", contenedor.codigo ?? "sin código"],
    ["Estado", contenedor.estado],
    ["Fecha de inicio", contenedor.fechaInicio.toLocaleDateString("es-ES")],
    ["Saldo inicial", saldoInicial, contenedor.monedaSaldoInicial],
    ["Total factura", totalFactura, contenedor.monedaTotalFactura],
    ["Recibido (USD)", recibido],
    ["Falta por cobrar (USD)", falta],
    ["Número de pagos", contenedor.pagos.length],
    ["Exportado el", new Date().toLocaleString("es-ES")],
  ];
  const wsResumen = XLSX.utils.aoa_to_sheet(resumen);
  wsResumen["!cols"] = [{ wch: 24 }, { wch: 22 }, { wch: 10 }];

  const cabecera = [
    "ID",
    "Contenedor",
    "Fecha",
    "Persona",
    "Banco",
    "Cobrador asignado",
    "Importe EUR",
    "Importe USD",
    "Tasa de cambio",
    "Fecha de la tasa",
    "Moneda original",
    "ID origen",
    "Creado por",
    "Creado en",
    "Actualizado por",
    "Actualizado en",
    "Cobrador asignado por",
    "Cobrador asignado en",
  ];

  const nombreUsuario = (u: { nombre: string | null; usuario: string } | null) =>
    u ? u.nombre || u.usuario : "";

  const filas = contenedor.pagos.map((p) => {
    return [
      p.id,
      contenedor.nombre,
      p.fecha.toLocaleDateString("es-ES"),
      p.persona,
      p.banco,
      p.cobrador?.nombre ?? "Sin asignar",
      p.importeEur !== null ? Number(p.importeEur) : "",
      p.importeUsd !== null ? Number(p.importeUsd) : "",
      p.tasaCambio !== null ? Number(p.tasaCambio) : "",
      p.fechaTasaCambio ? p.fechaTasaCambio.toLocaleDateString("es-ES") : "",
      p.monedaOriginal,
      p.idOrigen ?? "",
      nombreUsuario(p.creadoPor),
      p.creadoEn.toLocaleString("es-ES"),
      nombreUsuario(p.actualizadoPor),
      p.actualizadoEn.toLocaleString("es-ES"),
      p.cobradorAsignadoPor ? nombreUsuario(p.cobradorAsignadoPor) : "—",
      p.cobradorAsignadoEn ? p.cobradorAsignadoEn.toLocaleString("es-ES") : "—",
    ];
  });

  const wsPagos = XLSX.utils.aoa_to_sheet([
    cabecera,
    ...filas,
    ["", "", "", "SALDO INICIAL (no es un pago de cliente)", "", "", "", saldoInicial, "", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "TOTAL RECIBIDO", "", "", "", recibido, "", "", "", "", "", "", "", "", "", ""],
  ]);
  wsPagos["!cols"] = [
    { wch: 26 }, { wch: 22 }, { wch: 11 }, { wch: 28 }, { wch: 10 }, { wch: 18 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 24 },
    { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
  ];

  for (let fila = 1; fila <= filas.length; fila++) {
    const direccion = XLSX.utils.encode_cell({ r: fila, c: 8 });
    if (wsPagos[direccion] && typeof wsPagos[direccion].v === "number") {
      wsPagos[direccion].z = "0.0000";
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");
  XLSX.utils.book_append_sheet(wb, wsPagos, "Pagos");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const nombreFichero = `${contenedor.nombre.replace(/[^a-zA-Z0-9]+/g, "_")}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreFichero}"`,
    },
  });
}
