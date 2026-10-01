"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Contenedor = { id: string; nombre: string; estado: string };

export default function PagoManualForm({
  contenedores,
  contenedorActivoId,
  bancosExistentes,
}: {
  contenedores: Contenedor[];
  contenedorActivoId: string;
  bancosExistentes: string[];
}) {
  const router = useRouter();

  const [persona, setPersona] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [importe, setImporte] = useState("");
  const [moneda, setMoneda] = useState<"EUR" | "USD">("EUR");
  const [banco, setBanco] = useState("");
  const [contenedorId, setContenedorId] = useState(contenedorActivoId);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    setAviso(null);

    if (!persona.trim() || !fecha || !importe || !banco.trim() || !contenedorId) {
      setError("Todos los campos son obligatorios.");
      return;
    }
    const importeNum = parseFloat(importe);
    if (!importeNum || importeNum <= 0) {
      setError("El importe tiene que ser un número mayor que 0.");
      return;
    }

    setCargando(true);
    try {
      const res = await fetch("/api/pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: persona.trim(),
          fecha,
          importe: importeNum,
          moneda,
          banco: banco.trim(),
          contenedorId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al guardar el pago");
        setCargando(false);
        return;
      }
      if (data.sinTasa) {
        setAviso("Guardado, pero ese día no había tipo de cambio cargado todavía.");
      }
      setPersona("");
      setImporte("");
      router.refresh();
    } catch {
      setError("No se ha podido conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block font-mono text-[11px] uppercase text-steel mb-1.5">Nombre de quien paga</label>
        <input
          type="text"
          value={persona}
          onChange={(e) => setPersona(e.target.value)}
          placeholder="Ej. JUAN PEREZ GARCIA"
          className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-white"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-mono text-[11px] uppercase text-steel mb-1.5">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] font-mono bg-white"
          />
        </div>
        <div>
          <label className="block font-mono text-[11px] uppercase text-steel mb-1.5">Banco</label>
          <input
            type="text"
            value={banco}
            onChange={(e) => setBanco(e.target.value)}
            placeholder="Ej. BBVA"
            list="bancos-existentes"
            className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-white"
          />
          <datalist id="bancos-existentes">
            {bancosExistentes.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block font-mono text-[11px] uppercase text-steel mb-1.5">Importe</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            placeholder="0.00"
            className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] font-mono bg-white"
          />
        </div>
        <div>
          <label className="block font-mono text-[11px] uppercase text-steel mb-1.5">Moneda</label>
          <select
            value={moneda}
            onChange={(e) => setMoneda(e.target.value as "EUR" | "USD")}
            className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-white"
          >
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block font-mono text-[11px] uppercase text-steel mb-1.5">Contenedor</label>
        <select
          value={contenedorId}
          onChange={(e) => setContenedorId(e.target.value)}
          className="w-full border border-line rounded-lg px-3 py-2.5 text-[14px] bg-white"
        >
          <option value="">Selecciona un contenedor</option>
          {contenedores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} {c.estado === "ACTIVO" ? "(activo)" : ""}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-alert-bg border border-[#F3C9C9] rounded-xl p-3.5 text-[13.5px] text-[#8A2E2E]">
          {error}
        </div>
      )}
      {aviso && (
        <div className="bg-amber/10 border border-amber/30 rounded-xl p-3.5 text-[13.5px] text-amber-ink">
          {aviso}
        </div>
      )}

      <button
        onClick={guardar}
        disabled={cargando}
        className="w-full py-3.5 bg-amber text-[#241500] font-bold text-[14.5px] rounded-lg disabled:opacity-60"
      >
        {cargando ? "Guardando..." : "Añadir pago"}
      </button>
    </div>
  );
}
