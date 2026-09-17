import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { obtenerTasasOrdenadas, buscarTasaConFecha } from "@/lib/tipoCambio";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const IDS_DUPLICADOS_A_BORRAR = [
  "cmtyoha6v0005a15408u6qcfk",
  "cmtzjk7tf00069k1uj2rdo19o",
  "cmtzu9sgh000hdg0xbxyekmk5",
  "cmtzu9sgh000ddg0xa4au1eaq",
  "cmtzu9sgh000edg0x7oldqfof",
  "cmtyoha6v0003a154ds9zndcw",
  "cmtzu9sgh000bdg0xq925d69u",
  "cmtzjk7tf00039k1u2smt0qh5",
  "cmtzu9sgh000jdg0xd6bn60k1",
  "cmtzjk7tf00059k1u6bjo020p",
  "cmtzjk7tf00089k1uuftjn5p1",
  "cmtzjk7tf00049k1u54voqr8i",
  "cmtzjk7tf00019k1ut94rq9yq",
  "cmtzu9sgh0004dg0x9kyjs9ij",
  "cmtzjk7tf00029k1uonjh1koq",
];

const PAGOS_FALTANTES = [
  { persona: "YUSNIEL GONZALEZ MARTI", fecha: "2026-09-05", importe: 300, saldo: 97163.76 },
  { persona: "YULEIMY MARTINEZ GODOY", fecha: "2026-09-05", importe: 115, saldo: 96613.76 },
  { persona: "BARBARA MILAGROS VAZQUEZ ALONSO", fecha: "2026-09-05", importe: 115, saldo: 96333.76 },
  { persona: "RACHELY CRUZ FERNANDEZ", fecha: "2026-09-05", importe: 105, saldo: 96218.76 },
  { persona: "ALEXIS RUIZ BERNAL", fecha: "2026-09-05", importe: 105, saldo: 96113.76 },
  { persona: "ORAMAS CABEZAS ADIANIS", fecha: "2026-09-05", importe: 240, saldo: 95878.76 },
  { persona: "MAIRA DORTA CHAVEZ", fecha: "2026-09-05", importe: 400, saldo: 95518.76 },
  { persona: "MAITE RODRIGUEZ RODRIGUEZ", fecha: "2026-09-05", importe: 100, saldo: 95118.76 },
  { persona: "YOANDY HERNANDEZ VEGA", fecha: "2026-09-05", importe: 115, saldo: 95018.76 },
  { persona: "RIA Lithuania UAB", fecha: "2026-09-05", importe: 110, saldo: 94658.76 },
  { persona: "RIOLFI ANDREA", fecha: "2026-09-05", importe: 700, saldo: 94073.76 },
  { persona: "HERRERA GOMEZ JESUS ARTURO", fecha: "2026-09-05", importe: 250, saldo: 93021.76 },
  { persona: "REINIER NIEBLAS ABREU", fecha: "2026-09-05", importe: 30, saldo: 92541.76 },
  { persona: "YANELIS MOLINA CASTILLO", fecha: "2026-09-05", importe: 120, saldo: 92511.76 },
  { persona: "PEREZ GONZALEZ YANEIDY", fecha: "2026-09-05", importe: 240, saldo: 92391.76 },
];

function normalizarPersona(s: string): string {
  return s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^TRANSFERENCIA\s+/, "")
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function autorizado(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const accion = req.nextUrl.searchParams.get("accion");

  if (accion === "buscar-faltantes") {
    const resultados = [];
    for (const p of PAGOS_FALTANTES) {
      const nombreNorm = normalizarPersona(p.persona);
      const candidatos = await prisma.pago.findMany({
        where: {
          banco: "Sabadell",
          importeEur: p.importe,
        },
        include: { contenedor: { select: { nombre: true } } },
      });
      const coincidencias = candidatos.filter((c) => normalizarPersona(c.persona) === nombreNorm);
      resultados.push({
        persona: p.persona,
        importe: p.importe,
        encontradoEnOtroLado: coincidencias.map((c) => ({
          id: c.id,
          contenedor: c.contenedor?.nombre ?? null,
          fecha: c.fecha.toISOString().slice(0, 10),
          idOrigen: c.idOrigen,
        })),
      });
    }
    return NextResponse.json({ resultados });
  }

  if (accion === "eliminar-duplicados") {
    const encontrados = await prisma.pago.findMany({
      where: { id: { in: IDS_DUPLICADOS_A_BORRAR } },
      select: { id: true, persona: true, importeEur: true },
    });
    const resultado = await prisma.pago.deleteMany({ where: { id: { in: IDS_DUPLICADOS_A_BORRAR } } });
    return NextResponse.json({ borrados: resultado.count, detalle: encontrados });
  }

  if (accion === "crear-faltantes") {
    const contenedor = await prisma.contenedor.findFirst({ where: { nombre: "Contenedor 11" } });
    if (!contenedor) return NextResponse.json({ error: "No se encontró Contenedor 11" }, { status: 404 });

    const tasasOrdenadas = await obtenerTasasOrdenadas();
    const datos = PAGOS_FALTANTES.map((p) => {
      const encontrada = buscarTasaConFecha(tasasOrdenadas, p.fecha);
      const importeEur = round2(p.importe);
      const importeUsd = encontrada !== null ? round2(importeEur * encontrada.valor) : null;
      return {
        contenedorId: contenedor.id,
        fecha: new Date(p.fecha),
        persona: p.persona,
        importeEur,
        importeUsd,
        tasaCambio: encontrada?.valor ?? null,
        fechaTasaCambio: encontrada ? new Date(encontrada.fechaTasa) : null,
        monedaOriginal: "EUR",
        banco: "Sabadell",
        idOrigen: `SABADELL:${p.fecha}:${p.importe}:${p.saldo}`,
      };
    });

    const resultado = await prisma.pago.createMany({ data: datos, skipDuplicates: true });
    return NextResponse.json({ creados: resultado.count, detalle: datos });
  }

  return NextResponse.json({ error: "accion no reconocida" }, { status: 400 });
}
