import Link from "next/link";
import ContenedorForm from "@/components/ContenedorForm";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NuevoContenedorPage() {
  const ultimo = await prisma.pago.aggregate({ _max: { fechaHoraBanco: true } });
  const inicioBancoSugerido = ultimo._max.fechaHoraBanco ? ultimo._max.fechaHoraBanco.toISOString().slice(0, 19) : "";

  return (
    <div className="min-h-screen">
      <div className="bg-navy-950 text-white px-4.5 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link href="/dashboard/contenedores" className="font-mono text-[13px] text-steel-light">
          ← Contenedores
        </Link>
        <div className="font-display font-semibold text-base">Nuevo contenedor</div>
        <div className="w-10" />
      </div>

      <main className="max-w-xl mx-auto w-full px-4 py-6">
        <ContenedorForm
          inicial={{
            nombre: "",
            codigo: "",
            saldoInicial: "0",
            monedaSaldoInicial: "USD",
            fechaInicio: "",
            totalFactura: "",
            monedaTotalFactura: "USD",
            estado: "ACTIVO",
            inicioBanco: inicioBancoSugerido,
          }}
        />
      </main>
    </div>
  );
}
