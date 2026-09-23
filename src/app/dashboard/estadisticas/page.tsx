import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import GraficaPagosDiarios from "@/components/GraficaPagosDiarios";
import { obtenerTotalesDiarios, obtenerDuracionesContenedores } from "@/lib/estadisticasQuery";
import LineaTiempoContenedores from "@/components/LineaTiempoContenedores";

export const dynamic = "force-dynamic";

export default async function EstadisticasPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ contenedorId?: string; rango?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const filtros = {
    contenedorId: searchParams.contenedorId || "",
    rango: (searchParams.rango as "30" | "todo") || "30",
  };

  const session = await getServerSession(authOptions);
  const inicioHref = (session?.user as any)?.rol === "COBRADOR" ? "/mi/pendientes" : "/dashboard";

  const datos = await obtenerTotalesDiarios(filtros);
  const duraciones = await obtenerDuracionesContenedores();

  const contenedores = await prisma.contenedor.findMany({
    select: { id: true, nombre: true },
    orderBy: { creadoEn: "desc" },
  });

  return (
    <div className="min-h-screen">
      <div className="bg-navy-950 text-white px-4.5 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link href={inicioHref} className="font-mono text-[13px] text-steel-light">
          ← Inicio
        </Link>
        <div className="font-display font-semibold text-base">Estadísticas</div>
        <div className="w-10" />
      </div>

      <main className="max-w-2xl mx-auto w-full px-4 py-6">
        <GraficaPagosDiarios datosIniciales={datos} filtrosIniciales={filtros} contenedores={contenedores} />

        <div className="font-mono text-[11.5px] uppercase tracking-wide text-steel my-6 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-line">
          Tiempo en cobrar cada contenedor
        </div>
        <LineaTiempoContenedores duraciones={duraciones} />
      </main>
    </div>
  );
}
