"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function CambiarPasswordForm({ usuario }: { usuario: string }) {
  const router = useRouter();
  const [passwordActual, setPasswordActual] = useState("");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    if (!passwordActual) {
      setError("Introduce tu contraseña actual");
      return;
    }
    if (password.length < 6) {
      setError("Mínimo 6 caracteres");
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setCargando(true);
    try {
      const res = await fetch("/api/cambiar-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, passwordActual }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Error al guardar la contraseña");
        setCargando(false);
        return;
      }

      // Renovamos la sesión con la contraseña nueva para que el token deje de
      // marcar "debeCambiarPassword" y el middleware no vuelva a redirigir aquí.
      await signIn("credentials", { usuario, password, redirect: false });
      router.push("/");
      router.refresh();
    } catch {
      setError("No se ha podido conectar con el servidor");
      setCargando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="font-mono text-[10.5px] uppercase text-steel mb-1.5">Contraseña actual</div>
        <input
          type="password"
          value={passwordActual}
          onChange={(e) => setPasswordActual(e.target.value)}
          placeholder="la que acabas de usar para entrar"
          className="w-full px-3 py-2.5 border border-line rounded-lg text-[14px] outline-none focus:border-navy-800"
        />
      </div>
      <div>
        <div className="font-mono text-[10.5px] uppercase text-steel mb-1.5">Nueva contraseña</div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="mínimo 6 caracteres"
          className="w-full px-3 py-2.5 border border-line rounded-lg text-[14px] outline-none focus:border-navy-800"
        />
      </div>
      <div>
        <div className="font-mono text-[10.5px] uppercase text-steel mb-1.5">Confirmar contraseña</div>
        <input
          type="password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          placeholder="repite la contraseña"
          className="w-full px-3 py-2.5 border border-line rounded-lg text-[14px] outline-none focus:border-navy-800"
        />
      </div>
      {error && <div className="text-[12.5px] text-alert">{error}</div>}
      <button
        onClick={guardar}
        disabled={cargando}
        className="w-full py-3 bg-amber text-[#241500] font-bold text-[14.5px] rounded-lg disabled:opacity-60"
      >
        {cargando ? "Guardando..." : "Guardar y continuar"}
      </button>
    </div>
  );
}
