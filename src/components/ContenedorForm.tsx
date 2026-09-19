"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ContenedorInicial = {
  id?: string;
  nombre: string;
  codigo: string;
  saldoInicial: string;
  monedaSaldoInicial: string;
  fechaInicio: string;
  totalFactura: string;
  monedaTotalFactura: string;
  estado: string;
  inicioBanco?: string;
};

const ESTADOS = [
  { valor: "ACTIVO", etiqueta: "Activo" },
  { valor: "COMPLETADO", etiqueta: "Completado" },
  { valor: "FACTURADO", etiqueta: "Facturado" },
];

export default function ContenedorForm({ inicial }: { inicial: ContenedorInicial }) {
  const router = useRouter();
  const esEdicion = Boolean(inicial.id);

  const [nombre, setNombre] = useState(inicial.nombre);
  const [codigo, setCodigo] = useState(inicial.codigo);
  const [saldoInicial, setSaldoInicial] = useState(inicial.saldoInicial);
  const [monedaSaldoInicial, setMonedaSaldoInicial] = useState(inicial.monedaSaldoInicial);
  const [fechaInicio, setFechaInicio] = useState(inicial.fechaInicio);
  const [totalFactura, setTotalFactura] = useState(inicial.totalFactura);
  const [monedaTotalFactura, setMonedaTotalFactura] = useState(inicial.monedaTotalFactura);
  const [estado, setEstado] = useState(inicial.estado);
  const [inicioBanco, setInicioBanco] = useState(inicial.inicioBanco ?? "");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    if (!nombre.trim() || !fechaInicio || !totalFactura) {
      setError("Nombre, fecha de inicio y total factura son obligatorios.");
      return;
    }
    setCargando(true);

    const body = {
      nombre: nombre.trim(),
      codigo: codigo.trim() || null,
      saldoInicial: parseFloat(saldoInicial || "0"),
      monedaSaldoInicial,
      fechaInicio,
      totalFactura: parseFloat(totalFactura),
      monedaTotalFactura,
      estado,
      ...(!esEdicion && inicioBanco
        ? { inicioBanco: `${inicioBanco.length === 16 ? inicioBanco + ":00" : inicioBanco}Z` }
        : {}),
    };

    const url = esEdicion ? `/api/contenedores/${inicial.id}` : "/api/contenedores";
    const method = esEdicion ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setCargando(false);

    if (res.ok) {
      router.push("/dashboard/contenedores");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Error al guardar");
    }
  }

  return (
    <div>
      <div className="mb-4">
        <label className="block text-[11px] font-mono uppercase text-steel mb-1.5">Nombre</label>
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Contenedor 10"
          className="w-full px-3.5 py-2.5 border border-line rounded-lg text-[14px] outline-none focus:border-navy-800"
        />
      </div>

      <div className="mb-4">
        <label className="block text-[11px] font-mono uppercase text-steel mb-1.5">
          Código (opcional, se puede añadir más adelante)
        </label>
        <input
          type="text"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="MSKU9395463"
          className="w-full px-3.5 py-2.5 border border-line rounded-lg text-[14px] font-mono outline-none focus:border-navy-800"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-[11px] font-mono uppercase text-steel mb-1.5">Saldo inicial</label>
          <input
            type="number"
            step="0.01"
            value={saldoInicial}
            onChange={(e) => setSaldoInicial(e.target.value)}
            placeholder="0"
            className="w-full px-3.5 py-2.5 border border-line rounded-lg text-[14px] font-mono outline-none focus:border-navy-800"
          />
        </div>
        <div>
          <label className="block text-[11px] font-mono uppercase text-steel mb-1.5">Moneda</label>
          <select
            value={monedaSaldoInicial}
            onChange={(e) => setMonedaSaldoInicial(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-line rounded-lg text-[14px] outline-none focus:border-navy-800 bg-white"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-[11px] font-mono uppercase text-steel mb-1.5">
          Fecha de inicio (desde cuándo cuentan los pagos)
        </label>
        <input
          type="date"
          value={fechaInicio}
          onChange={(e) => setFechaInicio(e.target.value)}
          className="w-full px-3.5 py-2.5 border border-line rounded-lg text-[14px] font-mono outline-none focus:border-navy-800"
        />
      </div>

      {!esEdicion && (
        <div className="mb-4">
          <label className="block text-[11px] font-mono uppercase text-steel mb-1.5">
            Corte por orden del banco (opcional, hora UTC)
          </label>
          <input
            type="datetime-local"
            step="1"
            value={inicioBanco}
            onChange={(e) => setInicioBanco(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-line rounded-lg text-[14px] font-mono outline-none focus:border-navy-800"
          />
          <p className="text-[12px] text-steel mt-1.5">
            Los pagos posteriores a este momento (hora del banco) irán a este contenedor; los anteriores se
            quedan en el contenedor anterior. Por defecto es el último pago recibido hasta ahora, así que
            sincroniza Sabadell y Revolut antes de crear el contenedor. Vacío = funcionamiento clásico por fecha.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-[11px] font-mono uppercase text-steel mb-1.5">Total factura</label>
          <input
            type="number"
            step="0.01"
            value={totalFactura}
            onChange={(e) => setTotalFactura(e.target.value)}
            placeholder="93600"
            className="w-full px-3.5 py-2.5 border border-line rounded-lg text-[14px] font-mono outline-none focus:border-navy-800"
          />
        </div>
        <div>
          <label className="block text-[11px] font-mono uppercase text-steel mb-1.5">Moneda</label>
          <select
            value={monedaTotalFactura}
            onChange={(e) => setMonedaTotalFactura(e.target.value)}
            className="w-full px-3.5 py-2.5 border border-line rounded-lg text-[14px] outline-none focus:border-navy-800 bg-white"
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
      </div>

      <div className="mb-5">
        <label className="block text-[11px] font-mono uppercase text-steel mb-1.5">Estado</label>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="w-full px-3.5 py-2.5 border border-line rounded-lg text-[14px] outline-none focus:border-navy-800 bg-white"
        >
          {ESTADOS.map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.etiqueta}
            </option>
          ))}
        </select>
        {estado === "ACTIVO" && (
          <div className="text-[11px] text-amber-ink mt-1.5">
            ⚠ El Inicio muestra el primer contenedor "Activo" que encuentre — evita tener más de uno
            activo a la vez.
          </div>
        )}
      </div>

      {error && (
        <div className="bg-alert-bg border border-[#F3C9C9] rounded-lg p-3 text-[13px] text-[#8A2E2E] mb-4">
          {error}
        </div>
      )}

      <button
        onClick={guardar}
        disabled={cargando}
        className="w-full py-3 bg-amber text-[#241500] font-bold text-[14.5px] rounded-lg disabled:opacity-60"
      >
        {cargando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear contenedor"}
      </button>
    </div>
  );
}
