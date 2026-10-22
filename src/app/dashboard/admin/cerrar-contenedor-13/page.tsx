import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import CerrarContenedorForm from "@/components/CerrarContenedorForm";

export const dynamic = "force-dynamic";

export default async function CerrarContenedorPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).rol !== "SUPERADMIN") {
    redirect("/dashboard");
  }

  const contenedores = await prisma.contenedor.findMany({
    select: { id: true, nombre: true, estado: true },
    orderBy: [{ fechaInicio: "desc" }, { creadoEn: "desc" }],
  });

  return (
    <div className="min-h-screen">
      <div className="bg-navy-950 text-white px-4.5 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link href="/dashboard" className="font-mono text-[13px] text-steel-light">
          ← Inicio
        </Link>
        <div className="font-display font-semibold text-base">Mover excedente entre contenedores</div>
        <div className="w-10" />
      </div>

      <main className="max-w-xl mx-auto w-full px-4 py-6">
        <CerrarContenedorForm contenedores={contenedores} />
      </main>
    </div>
  );
}
