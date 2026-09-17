"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!usuario.trim() || !password.trim()) {
      setError("Introduce usuario y contraseña.");
      return;
    }
    setLoading(true);
    const res = await signIn("credentials", {
      usuario,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Usuario o contraseña incorrectos.");
      return;
    }
    router.push("/");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[radial-gradient(circle_at_15%_15%,rgba(245,166,35,0.10),transparent_40%),linear-gradient(160deg,#0B1526_0%,#0F1D33_60%,#152B49_100%)]">
      <div className="w-full max-w-[380px] bg-navy-900 border border-white/10 rounded-2xl p-9 pt-9 pb-8 shadow-2xl">
        <div className="flex items-center gap-2 text-[11px] tracking-[0.18em] uppercase text-amber font-mono mb-6 before:content-[''] before:w-[18px] before:h-[2px] before:bg-amber">
          BOOMERANG MANAGEMENT
        </div>
        <h1 className="font-display text-2xl text-white font-semibold mb-1">Acceso al panel</h1>
        <p className="text-steel-light text-sm mb-7">
          Introduce tus credenciales para continuar.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-[11.5px] font-semibold uppercase tracking-wide text-steel-light font-mono mb-2">
              Usuario
            </label>
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              className="w-full px-3.5 py-3 bg-white/[0.04] border border-white/[0.14] rounded-lg text-white text-[15px] outline-none focus:border-amber placeholder:text-[#4E5D74]"
            />
          </div>
          <div className="mb-4">
            <label className="block text-[11.5px] font-semibold uppercase tracking-wide text-steel-light font-mono mb-2">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={mostrarPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full px-3.5 py-3 pr-11 bg-white/[0.04] border border-white/[0.14] rounded-lg text-white text-[15px] outline-none focus:border-amber placeholder:text-[#4E5D74]"
              />
              <button
                type="button"
                onClick={() => setMostrarPassword((v) => !v)}
                className="absolute right-0 top-0 h-full w-11 flex items-center justify-center text-steel-light hover:text-white"
                tabIndex={-1}
                aria-label={mostrarPassword ? "Ocultar contraseña" : "Ver contraseña"}
              >
                {mostrarPassword ? (
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-[12.5px] text-red-300 font-mono mb-3.5">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-amber text-[#241500] font-bold text-[14.5px] rounded-lg disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <a
          href="https://www.blglobalsuministro.com/"
          className="mt-4 block w-full py-3 text-center border border-white/[0.14] text-steel-light font-semibold text-[13.5px] rounded-lg hover:bg-white/[0.04] hover:text-white"
        >
          Ir a BL Global Suministro
        </a>
      </div>
    </div>
  );
}
