import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ContenedorForm from "@/components/ContenedorForm";

export const dynamic = "force-dynamic";

export default async function EditarContenedorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contenedor = await prisma.contenedor.findUnique({ where: { id } });
  if (!contenedor) notFound();

  return (
    <div className="min-h-screen">
      <div className="bg-navy-950 text-white px-4.5 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link href="/dashboard/contenedores" className="font-mono text-[13px] text-steel-light">
          ← Contenedores
        </Link>
        <div className="font-display font-semibold text-base">{contenedor.nombre}</div>
        <div className="w-10" />
      </div>

      <main className="max-w-xl mx-auto w-full px-4 py-6">
        <ContenedorForm
          inicial={{
            id: contenedor.id,
            nombre: contenedor.nombre,
            codigo: contenedor.codigo ?? "",
            saldoInicial: String(contenedor.saldoInicial),
            monedaSaldoInicial: contenedor.monedaSaldoInicial,
            fechaInicio: contenedor.fechaInicio.toISOString().slice(0, 10),
            totalFactura: String(contenedor.totalFactura),
            monedaTotalFactura: contenedor.monedaTotalFactura,
            estado: contenedor.estado,
          }}
        />
      </main>
    </div>
  );
}
