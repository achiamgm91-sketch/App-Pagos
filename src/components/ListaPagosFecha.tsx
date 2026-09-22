"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import AsignarCobrador from "@/components/AsignarCobrador";
import QuitarAsignacion from "@/components/QuitarAsignacion";
import TarjetaPago from "@/components/TarjetaPago";
import RecalcularImportes from "@/components/RecalcularImportes";
import { round2, formatMonto } from "@/lib/format";

const SIN_ASIGNAR = "__SIN_ASIGNAR__";
const SIN_CONTENEDOR = "__SIN_CONTENEDOR__";

type PagoFecha = {
  id: string;
  fecha: string;
  persona: string;
  banco: string;
  contenedorId: string | null;
  contenedorNombre: string | null;
  cobradorNombre: string | null;
  etiquetaAsignacion: string | null;
  importeUsd: number | null;
  importeEur: number | null;
  tasaCambio: number | null;
  fechaTasaCambio: string | null;
  monedaOriginal: string;
  devuelto: boolean;
};

type Filtros = {
  contenedorId: string;
  fecha: string;
  nombre: string;
  cobrador: string;
  monto: string;
  moneda: "EUR" | "USD";
};

function importeOriginal(p: PagoFecha) {
  return p.monedaOriginal === "USD" ? p.importeUsd : p.importeEur;
}
function simboloOriginal(p: PagoFecha) {
  return p.monedaOriginal === "USD" ? "$" : "€";
}
function importeConvertido(p: PagoFecha) {
  return p.monedaOriginal === "USD" ? p.importeEur : p.importeUsd;
}
function simboloConvertido(p: PagoFecha) {
  return p.monedaOriginal === "USD" ? "€" : "$";
}

export default function ListaPagosFecha({
  pagosIniciales,
  totalUsdInicial,
  totalEurInicial,
  totalCountInicial,
  sinAsignarInicial,
  hasMoreInicial,
  filtrosIniciales,
  contenedores,
  cobradores,
  esSuperAdmin,
}: {
  pagosIniciales: PagoFecha[];
  totalUsdInicial: number;
  totalEurInicial: number;
  totalCountInicial: number;
  sinAsignarInicial: number;
  hasMoreInicial: boolean;
  filtrosIniciales: Filtros;
  contenedores: { id: string; nombre: string }[];
  cobradores: { id: string; nombre: string }[];
  esSuperAdmin: boolean;
}) {
  const router = useRouter();

  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciales);
  const [pagos, setPagos] = useState(pagosIniciales);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(hasMoreInicial);
  const [cargandoMas, setCargandoMas] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function actualizarUrl(nuevosFiltros: Filtros) {
    const params = new URLSearchParams();
    if (nuevosFiltros.contenedorId) params.set("contenedorId", nuevosFiltros.contenedorId);
    if (nuevosFiltros.fecha) params.set("fecha", nuevosFiltros.fecha);
    if (nuevosFiltros.nombre) params.set("nombre", nuevosFiltros.nombre);
    if (nuevosFiltros.cobrador) params.set("cobrador", nuevosFiltros.cobrador);
    if (nuevosFiltros.monto) params.set("monto", nuevosFiltros.monto);
    if (nuevosFiltros.moneda !== "EUR") params.set("moneda", nuevosFiltros.moneda);
    router.push(`/dashboard/pagos${params.toString() ? "?" + params.toString() : ""}`);
  }

  function cambiarFiltroInmediato(campo: keyof Filtros, valor: string) {
    const nuevos = { ...filtros, [campo]: valor };
    setFiltros(nuevos);
    actualizarUrl(nuevos);
  }

  function cambiarFiltroConDebounce(campo: keyof Filtros, valor: string) {
    const nuevos = { ...filtros, [campo]: valor };
    setFiltros(nuevos);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => actualizarUrl(nuevos), 450);
  }

  function limpiarFiltros() {
    const vacios: Filtros = { contenedorId: "", fecha: "", nombre: "", cobrador: "", monto: "", moneda: "EUR" };
    setFiltros(vacios);
    actualizarUrl(vacios);
  }

  async function cargarMas() {
    setCargandoMas(true);
    try {
      const params = new URLSearchParams();
      if (filtros.contenedorId) params.set("contenedorId", filtros.contenedorId);
      if (filtros.fecha) params.set("fecha", filtros.fecha);
      if (filtros.nombre) params.set("nombre", filtros.nombre);
      if (filtros.cobrador) params.set("cobrador", filtros.cobrador);
      if (filtros.monto) params.set("monto", filtros.monto);
      params.set("moneda", filtros.moneda);
      params.set("page", String(page + 1));

      const res = await fetch(`/api/pagos?${params.toString()}`);
      if (!res.ok) throw new Error("No se pudo cargar más pagos");
      const data = await res.json();

      setPagos((prev) => [...prev, ...data.pagos]);
      setPage((p) => p + 1);
      setHasMore(data.hasMore);
    } catch {
      // el botón "Cargar más" se puede volver a pulsar si falla
    } finally {
      setCargandoMas(false);
    }
  }

  const hayFiltrosActivos = Boolean(
    filtros.contenedorId || filtros.fecha || filtros.nombre || filtros.cobrador || filtros.monto
  );

  return (
    <div>
      <div className="bg-white border border-line rounded-xl p-3.5 mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] text-steel uppercase">
            {hayFiltrosActivos ? "Total filtrado" : "Total cargado en la app"}
          </div>
          <div className="font-mono font-semibold text-[22px] mt-0.5">{formatMonto(totalUsdInicial, "$")}</div>
          <div className="font-mono text-[12.5px] text-steel mt-0.5">
            {formatMonto(totalEurInicial, "€")} · {totalCountInicial} pago(s)
            {sinAsignarInicial > 0 && ` · ${sinAsignarInicial} sin asignar`}
          </div>
        </div>
        <RecalcularImportes />
      </div>

      {hayFiltrosActivos && (
        <button
          onClick={limpiarFiltros}
          className="mb-3 text-[12px] font-mono text-alert underline underline-offset-2"
        >
          Quitar todos los filtros
        </button>
      )}

      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-steel flex-shrink-0">📦</span>
        <select
          value={filtros.contenedorId}
          onChange={(e) => cambiarFiltroInmediato("contenedorId", e.target.value)}
          className="flex-1 min-w-0 px-3 py-2.5 bg-white border border-line rounded-lg text-[13px] outline-none focus:border-navy-800"
        >
          <option value="">Todos los contenedores</option>
          <option value={SIN_CONTENEDOR}>Sin contenedor</option>
          {contenedores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5 mb-1.5">
        <input
          type="date"
          value={filtros.fecha}
          onChange={(e) => cambiarFiltroInmediato("fecha", e.target.value)}
          className="flex-1 min-w-0 px-2.5 py-2.5 bg-white border border-line rounded-lg text-[12.5px] font-mono outline-none focus:border-navy-800"
        />
        <input
          type="text"
          inputMode="decimal"
          defaultValue={filtros.monto}
          onChange={(e) => cambiarFiltroConDebounce("monto", e.target.value)}
          placeholder="Importe"
          className="flex-1 min-w-0 px-2.5 py-2.5 bg-white border border-line rounded-lg text-[12.5px] font-mono outline-none focus:border-navy-800"
        />
        <div className="flex-shrink-0 flex border border-line rounded-lg overflow-hidden">
          <button
            onClick={() => cambiarFiltroInmediato("moneda", "EUR")}
            className={`px-2.5 py-2.5 text-[12.5px] font-mono font-semibold ${
              filtros.moneda === "EUR" ? "bg-navy-950 text-white" : "bg-white text-steel"
            }`}
          >
            €
          </button>
          <button
            onClick={() => cambiarFiltroInmediato("moneda", "USD")}
            className={`px-2.5 py-2.5 text-[12.5px] font-mono font-semibold ${
              filtros.moneda === "USD" ? "bg-navy-950 text-white" : "bg-white text-steel"
            }`}
          >
            $
          </button>
        </div>
      </div>
      {filtros.fecha && (
        <button
          onClick={() => cambiarFiltroInmediato("fecha", "")}
          className="mb-2 text-[11px] font-mono text-steel underline underline-offset-2"
        >
          Quitar filtro de fecha
        </button>
      )}

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          defaultValue={filtros.nombre}
          onChange={(e) => cambiarFiltroConDebounce("nombre", e.target.value)}
          placeholder="Buscar por nombre..."
          className="flex-1 min-w-0 px-3.5 py-2.5 bg-white border border-line rounded-lg text-[13.5px] outline-none focus:border-navy-800"
        />
        <select
          value={filtros.cobrador}
          onChange={(e) => cambiarFiltroInmediato("cobrador", e.target.value)}
          className="flex-1 min-w-0 px-2.5 py-2.5 bg-white border border-line rounded-lg text-[13px] outline-none focus:border-navy-800"
        >
          <option value="">Todos los cobradores</option>
          <option value={SIN_ASIGNAR}>Sin asignar</option>
          {cobradores.map((c) => (
            <option key={c.id} value={c.nombre}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      {pagos.length === 0 ? (
        <div className="text-center text-steel text-[13.5px] py-10">
          No hay pagos que coincidan con los filtros.
        </div>
      ) : (
        <>
          {pagos.map((pago) => (
            <TarjetaPago key={pago.id} pago={pago} contenedores={contenedores} cobradores={cobradores} esSuperAdmin={esSuperAdmin} />
          ))}

          {hasMore && (
            <button
              onClick={cargarMas}
              disabled={cargandoMas}
              className="w-full py-3 bg-white border border-line rounded-lg text-[13px] font-semibold text-navy-800 disabled:opacity-60 mt-1"
            >
              {cargandoMas ? "Cargando..." : `Cargar más (${pagos.length} de ${totalCountInicial})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
