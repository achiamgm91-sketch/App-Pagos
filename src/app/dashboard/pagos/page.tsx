import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import ListaPagosFecha from "@/components/ListaPagosFecha";
import { obtenerPagosFiltrados, simplificarPago } from "@/lib/pagosQuery";

export const dynamic = "force-dynamic";

export default async function PagosPorFechaPage({
  searchParams,
}: {
  searchParams: {
    contenedorId?: string;
    fecha?: string;
    nombre?: string;
    cobrador?: string;
    monto?: string;
    moneda?: string;
  };
}) {
  const filtros = {
    contenedorId: searchParams.contenedorId || "",
    fecha: searchParams.fecha || "",
    nombre: searchParams.nombre || "",
    cobrador: searchParams.cobrador || "",
    monto: searchParams.monto || "",
    moneda: (searchParams.moneda as "EUR" | "USD") || "EUR",
  };

  const session = await getServerSession(authOptions);
  const esSuperAdmin = (session?.user as any)?.rol === "SUPERADMIN";
  const inicioHref = (session?.user as any)?.rol === "COBRADOR" ? "/mi/pendientes" : "/dashboard";

  const resultado = await obtenerPagosFiltrados(filtros, 1);
  const pagosSimplificados = resultado.pagos.map(simplificarPago);

  const contenedores = await prisma.contenedor.findMany({
    select: { id: true, nombre: true },
    orderBy: { creadoEn: "desc" },
  });

  const cobradores = await prisma.cobrador.findMany({
    where: { activo: true },
    select: { id: true, nombre: true },
  });

  return (
    <div className="min-h-screen">
      <div className="bg-navy-950 text-white px-4.5 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link href={inicioHref} className="font-mono text-[13px] text-steel-light">
          ← Inicio
        </Link>
        <div className="font-display font-semibold text-base">Pagos</div>
        <div className="w-10" />
      </div>

      <main className="max-w-2xl mx-auto w-full px-4 py-6">
        <ListaPagosFecha
          key={JSON.stringify(filtros)}
          pagosIniciales={pagosSimplificados}
          totalUsdInicial={resultado.totalUsd}
          totalEurInicial={resultado.totalEur}
          totalCountInicial={resultado.totalCount}
          sinAsignarInicial={resultado.sinAsignarCount}
          hasMoreInicial={resultado.hasMore}
          filtrosIniciales={filtros}
          contenedores={contenedores}
          cobradores={cobradores}
          esSuperAdmin={esSuperAdmin}
        />
      </main>
    </div>
  );
}
