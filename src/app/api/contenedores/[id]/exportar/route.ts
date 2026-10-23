import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { round2 } from "@/lib/format";
import { ORDEN_BANCO_DESC, ORDEN_BANCO_ASC } from "@/lib/pagosBanco";
import { tienePermiso } from "@/lib/permisos";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const rolSesion = (session?.user as any)?.rol;
  const permisosSesion = (session?.user as any)?.permisos;
  if (
    !session ||
    (!tienePermiso(rolSesion, permisosSesion, "ver_contenedores") &&
      !tienePermiso(rolSesion, permisosSesion, "gestionar_contenedores"))
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const contenedor = await prisma.contenedor.findUnique({
    where: { id: id },
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

  const totalFactura = Number(contenedor.totalFactura);
  const monedaTotalFactura = contenedor.monedaTotalFactura;

  // El saldo inicial y los pagos pueden estar en EUR o en USD; hay que sumarlos en la
  // misma moneda que el total de factura, igual que en el cierre automático y en el
  // Inicio (ver cierreAutomatico.ts y dashboard/page.tsx — ahí estaba el mismo fallo).
  const ultimoTipoCambio = await prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "desc" } });
  const ultimaTasa = ultimoTipoCambio ? Number(ultimoTipoCambio.usdPorEur) : null;

  let saldoInicial = Number(contenedor.saldoInicial);
  if (contenedor.monedaSaldoInicial !== monedaTotalFactura && saldoInicial !== 0 && ultimaTasa) {
    saldoInicial = monedaTotalFactura === "EUR" ? saldoInicial / ultimaTasa : saldoInicial * ultimaTasa;
  }

  const importeEnMonedaContenedor = (p: { importeEur: unknown; importeUsd: unknown }) => {
    const v = monedaTotalFactura === "EUR" ? p.importeEur : p.importeUsd;
    return v === null || v === undefined ? null : Number(v);
  };

  const pagosConImporte = contenedor.pagos.filter((p) => importeEnMonedaContenedor(p) !== null && !p.devuelto);
  const recibido = round2(
    saldoInicial + pagosConImporte.reduce((sum, p) => sum + (importeEnMonedaContenedor(p) ?? 0), 0)
  );
  const falta = round2(Math.max(totalFactura - recibido, 0));

  const resumen = [
    ["Contenedor", contenedor.nombre],
    ["Código", contenedor.codigo ?? "sin código"],
    ["Estado", contenedor.estado],
    ["Fecha de inicio", contenedor.fechaInicio.toLocaleDateString("es-ES")],
    ["Saldo inicial", saldoInicial, monedaTotalFactura],
    ["Total factura", totalFactura, monedaTotalFactura],
    [`Recibido (${monedaTotalFactura})`, recibido],
    [`Falta por cobrar (${monedaTotalFactura})`, falta],
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
    "Devuelto",
    "Motivo devolución",
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
      p.devuelto ? `Sí (${p.devueltoEn ? p.devueltoEn.toLocaleDateString("es-ES") : ""})` : "",
      p.devueltoNota ?? "",
    ];
  });

  // Las dos filas de totales van en la columna "Importe EUR" o "Importe USD" según la
  // moneda del total de factura (saldoInicial y recibido ya están convertidos a esa moneda).
  const filaSaldoInicial =
    monedaTotalFactura === "EUR"
      ? ["", "", "", "SALDO INICIAL (no es un pago de cliente)", "", "", saldoInicial, "", "", "", "", "", "", "", "", "", "", "", ""]
      : ["", "", "", "SALDO INICIAL (no es un pago de cliente)", "", "", "", saldoInicial, "", "", "", "", "", "", "", "", "", "", ""];
  const filaRecibido =
    monedaTotalFactura === "EUR"
      ? ["", "", "", "TOTAL RECIBIDO (sin devoluciones)", "", "", recibido, "", "", "", "", "", "", "", "", "", "", "", ""]
      : ["", "", "", "TOTAL RECIBIDO (sin devoluciones)", "", "", "", recibido, "", "", "", "", "", "", "", "", "", "", ""];

  const wsPagos = XLSX.utils.aoa_to_sheet([cabecera, ...filas, filaSaldoInicial, filaRecibido]);
  wsPagos["!cols"] = [
    { wch: 26 }, { wch: 22 }, { wch: 11 }, { wch: 28 }, { wch: 10 }, { wch: 18 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 24 },
    { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 28 },
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
