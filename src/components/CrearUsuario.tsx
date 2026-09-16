"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Cobrador = { id: string; nombre: string };

export default function CrearUsuario({
  cobradores,
  puedeCrearSuperAdmin,
}: {
  cobradores: Cobrador[];
  puedeCrearSuperAdmin?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<"ADMIN" | "COBRADOR" | "SUPERADMIN">("COBRADOR");
  const [cobradorId, setCobradorId] = useState("");
  const [verTodosPagos, setVerTodosPagos] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setUsuario("");
    setNombre("");
    setPassword("");
    setRol("COBRADOR");
    setCobradorId("");
    setVerTodosPagos(false);
    setError(null);
  }

  async function crear() {
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, nombre, password, rol, cobradorId: cobradorId || null, verTodosPagos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Error al crear el usuario");
        setCargando(false);
        return;
      }
      reset();
      setAbierto(false);
      router.refresh();
    } catch {
      setError("No se ha podido conectar con el servidor");
    } finally {
      setCargando(false);
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="w-full mb-5 py-3 bg-navy-950 text-white font-semibold text-[13.5px] rounded-lg"
      >
        + Crear usuario
      </button>
    );
  }

  return (
    <div className="bg-white border border-line rounded-xl p-4 mb-5 space-y-3">
      <div className="font-display font-semibold text-[15px] mb-1">Nuevo usuario</div>

      <div>
        <div className="font-mono text-[10.5px] uppercase text-steel mb-1.5">Usuario (login)</div>
        <input
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          placeholder="ej. vasallo"
          className="w-full px-3 py-2 border border-line rounded-lg text-[13.5px] outline-none focus:border-navy-800"
        />
      </div>

      <div>
        <div className="font-mono text-[10.5px] uppercase text-steel mb-1.5">Nombre</div>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="ej. Vasallo"
          className="w-full px-3 py-2 border border-line rounded-lg text-[13.5px] outline-none focus:border-navy-800"
        />
      </div>

      <div>
        <div className="font-mono text-[10.5px] uppercase text-steel mb-1.5">Contraseña inicial</div>
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="mínimo 6 caracteres"
          className="w-full px-3 py-2 border border-line rounded-lg text-[13.5px] outline-none focus:border-navy-800"
        />
        <div className="text-[11px] text-steel mt-1">
          Se le pedirá cambiarla la primera vez que inicie sesión.
        </div>
      </div>

      <div>
        <div className="font-mono text-[10.5px] uppercase text-steel mb-1.5">Rol</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRol("COBRADOR")}
            className={`flex-1 py-2 rounded-lg text-[13px] font-semibold border ${
              rol === "COBRADOR" ? "bg-navy-950 text-white border-navy-950" : "border-line"
            }`}
          >
            Cobrador
          </button>
          <button
            type="button"
            onClick={() => setRol("ADMIN")}
            className={`flex-1 py-2 rounded-lg text-[13px] font-semibold border ${
              rol === "ADMIN" ? "bg-navy-950 text-white border-navy-950" : "border-line"
            }`}
          >
            Administrador
          </button>
          {puedeCrearSuperAdmin && (
            <button
              type="button"
              onClick={() => setRol("SUPERADMIN")}
              className={`flex-1 py-2 rounded-lg text-[13px] font-semibold border ${
                rol === "SUPERADMIN" ? "bg-navy-950 text-white border-navy-950" : "border-line"
              }`}
            >
              Superadmin
            </button>
          )}
        </div>
      </div>

      {rol === "COBRADOR" && (
        <>
          <div>
            <div className="font-mono text-[10.5px] uppercase text-steel mb-1.5">
              Vincular al cobrador (opcional)
            </div>
            <select
              value={cobradorId}
              onChange={(e) => setCobradorId(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded-lg text-[13.5px] outline-none focus:border-navy-800 bg-white"
            >
              <option value="">Sin vincular</option>
              {cobradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-[13px] cursor-pointer">
            <input
              type="checkbox"
              checked={verTodosPagos}
              onChange={(e) => setVerTodosPagos(e.target.checked)}
              className="w-4 h-4"
            />
            Puede ver los pagos de todos los cobradores (no solo los suyos)
          </label>
        </>
      )}

      {error && <div className="text-[12.5px] text-alert">{error}</div>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={crear}
          disabled={cargando}
          className="flex-1 py-2.5 bg-amber text-[#241500] font-bold text-[13.5px] rounded-lg disabled:opacity-60"
        >
          {cargando ? "Creando..." : "Crear usuario"}
        </button>
        <button
          onClick={() => {
            setAbierto(false);
            reset();
          }}
          className="px-4 py-2.5 border border-line text-[13px] rounded-lg"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
