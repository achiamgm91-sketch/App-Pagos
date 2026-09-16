import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import CambiarPasswordForm from "@/components/CambiarPasswordForm";

export const dynamic = "force-dynamic";

export default async function CambiarPasswordPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const usuario = (session!.user as any).usuario as string;
  const obligatorio = (session!.user as any).debeCambiarPassword as boolean;

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white border border-line rounded-2xl p-6">
        <div className="font-mono text-[11px] uppercase text-steel mb-1.5">Boomerang Management</div>
        <h1 className="font-display text-[20px] font-semibold mb-1">Cambia tu contraseña</h1>
        <p className="text-steel text-[13px] mb-5">
          {obligatorio
            ? "Un administrador te ha creado el acceso. Por seguridad, establece tu propia contraseña antes de continuar."
            : "Elige una nueva contraseña para tu cuenta."}
        </p>
        <CambiarPasswordForm usuario={usuario} />
      </div>
    </div>
  );
}
