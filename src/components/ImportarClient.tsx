"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatUsd, formatEur } from "@/lib/format";

type PagoResumen = { persona: string; fecha: string; importeEur: number | null; importeUsd: number | null };

type ResultadoPagos = {
  tipo: "pagos";
  banco: string;
  contenedor: string;
  totalFichero: number;
  nuevos: number;
  duplicados: number;
  anterioresAlInicio: number;
  sinTasa: number;
  pagosNuevos: PagoResumen[];
};

type ResultadoTipoCambio = {
  tipo: "tipoCambio";
  totalFichero: number;
  nuevos: number;
  existentes: number;
  ultimaFecha: string | null;
};

type ResultadoRevolut = {
  tipo: "revolut";
  contenedor: string;
  desdeUsado: string;
  totalRevolut: number;
  nuevos: number;
  duplicados: number;
  anterioresAlInicio: number;
  sinTasa: number;
  pagosNuevos: PagoResumen[];
};

type ResultadoSabadell = {
  tipo: "sabadell";
  contenedor: string;
  desdeUsado: string;
  totalSabadell: number;
  nuevos: number;
  duplicados: number;
  anterioresAlInicio: number;
  sinTasa: number;
  pagosNuevos: PagoResumen[];
};

type Resultado = ResultadoPagos | ResultadoTipoCambio | ResultadoRevolut | ResultadoSabadell;

type UltimoPagoBanco = {
  banco: string;
  ultimaFecha: string | null;
  persona: string | null;
  importeUsd: number | null;
  importeEur: number | null;
};

type EjecucionBCE = {
  origen: "CRON" | "MANUAL";
  ejecutadoEn: string;
  exitoso: boolean;
  mensajeError?: string | null;
  nuevos?: number | null;
  actualizados?: number | null;
  existentes?: number | null;
  ultimaFecha?: string | null;
  usuarioNombre?: string | null;
};

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES");
}

function formatFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

function formatImporteBanco(b: UltimoPagoBanco) {
  if (b.importeUsd !== null) {
    return formatUsd(b.importeUsd);
  }
  if (b.importeEur !== null) {
    return formatEur(b.importeEur) + " (sin tasa)";
  }
  return null;
}

function ListaPagosNuevos({ pagos }: { pagos: PagoResumen[] }) {
  return (
    <>
      <div className="font-mono text-[11.5px] uppercase tracking-wide text-steel mb-2">
        Pagos nuevos importados
      </div>
      <div className="bg-white border border-line rounded-xl px-4">
        {pagos.map((p, i) => (
          <div key={i} className="flex justify-between items-center py-3 border-b border-line last:border-0 gap-2">
            <div>
              <div className="font-semibold text-[13.5px]">{p.persona}</div>
              <div className="font-mono text-xs text-steel mt-0.5">{p.fecha}</div>
            </div>
            <div className="font-mono font-semibold text-right whitespace-nowrap">
              {p.importeUsd !== null
                ? formatUsd(p.importeUsd)
                : p.importeEur !== null
                ? formatEur(p.importeEur) + " (sin tasa)"
                : "—"}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function TarjetaEjecucionBCE({ titulo, ejecucion }: { titulo: string; ejecucion: EjecucionBCE | null }) {
  if (!ejecucion) {
    return (
      <div className="bg-white border border-line rounded-xl p-3.5 text-[13px]">
        <div className="font-mono text-[10.5px] uppercase text-steel mb-1.5">{titulo}</div>
        <div className="text-steel">Todavía no se ha ejecutado ninguna vez</div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl p-3.5 text-[13px] border ${
        ejecucion.exitoso ? "bg-white border-line" : "bg-alert-bg border-[#F3C9C9]"
      }`}
    >
      <div className="font-mono text-[10.5px] uppercase text-steel mb-1.5">{titulo}</div>
      <div className="flex justify-between items-start gap-2">
        <div>
          <div className={ejecucion.exitoso ? "" : "text-[#8A2E2E] font-semibold"}>
            {ejecucion.exitoso ? "✓ Completada correctamente" : "✗ Falló"}
          </div>
          {!ejecucion.exitoso && ejecucion.mensajeError && (
            <div className="text-[12px] text-[#8A2E2E] mt-1">{ejecucion.mensajeError}</div>
          )}
          {ejecucion.exitoso && (
            <div className="text-[12px] text-steel mt-1 font-mono">
              {ejecucion.nuevos ?? 0} nuevas · {ejecucion.actualizados ?? 0} actualizadas
              {ejecucion.ultimaFecha && <> · hasta {formatFecha(ejecucion.ultimaFecha)}</>}
            </div>
          )}
          {ejecucion.usuarioNombre && (
            <div className="text-[11.5px] text-steel mt-1">por {ejecucion.usuarioNombre}</div>
          )}
        </div>
        <div className="font-mono text-[11.5px] text-steel whitespace-nowrap">
          {formatFechaHora(ejecucion.ejecutadoEn)}
        </div>
      </div>
    </div>
  );
}

export default function ImportarClient({
  ultimaFechaTipoCambio,
  ultimosPorBanco,
  fechaSugeridaRevolut,
  fechaSugeridaSabadell,
  sabadellConectado,
  ultimaEjecucionCron,
  ultimaEjecucionManual,
}: {
  ultimaFechaTipoCambio: string | null;
  ultimosPorBanco: UltimoPagoBanco[];
  fechaSugeridaRevolut: string;
  fechaSugeridaSabadell: string;
  sabadellConectado: boolean;
  ultimaEjecucionCron: EjecucionBCE | null;
  ultimaEjecucionManual: EjecucionBCE | null;
}) {
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargandoRevolut, setCargandoRevolut] = useState(false);
  const [errorRevolut, setErrorRevolut] = useState<string | null>(null);
  const [fechaDesde, setFechaDesde] = useState(fechaSugeridaRevolut);
  const [cargandoSabadell, setCargandoSabadell] = useState(false);
  const [errorSabadell, setErrorSabadell] = useState<string | null>(null);
  const [fechaDesdeSabadell, setFechaDesdeSabadell] = useState(fechaSugeridaSabadell);
  const [avisoSabadell, setAvisoSabadell] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ultimaFecha, setUltimaFecha] = useState<string | null>(ultimaFechaTipoCambio);
  const [porBanco, setPorBanco] = useState(ultimosPorBanco);
  const [cargandoBCE, setCargandoBCE] = useState(false);
  const [ejecucionCron, setEjecucionCron] = useState(ultimaEjecucionCron);
  const [ejecucionManual, setEjecucionManual] = useState(ultimaEjecucionManual);

  useEffect(() => {
    if (searchParams.get("sabadellConectado")) {
      setAvisoSabadell("Conexión con Sabadell establecida correctamente.");
    } else if (searchParams.get("sabadellError")) {
      setErrorSabadell(`Error al conectar con Sabadell: ${searchParams.get("sabadellError")}`);
    }
  }, [searchParams]);

  function actualizarUltimoPorBanco(banco: string, pagosNuevos: PagoResumen[]) {
    if (!pagosNuevos || pagosNuevos.length === 0) return;
    const masReciente = pagosNuevos.reduce((max, p) => (p.fecha > max.fecha ? p : max), pagosNuevos[0]);
    setPorBanco((prev) =>
      prev.map((b) =>
        b.banco === banco && (!b.ultimaFecha || masReciente.fecha > b.ultimaFecha)
          ? {
              ...b,
              ultimaFecha: masReciente.fecha,
              persona: masReciente.persona,
              importeUsd: masReciente.importeUsd,
              importeEur: masReciente.importeEur,
            }
          : b
      )
    );
  }

  function elegirArchivo(f: File | null) {
    setResultado(null);
    setError(null);
    setArchivo(f);
  }

  async function importar() {
    if (!archivo) return;
    setCargando(true);
    setError(null);
    setResultado(null);

    const fd = new FormData();
    fd.append("file", archivo);

    try {
      const res = await fetch("/api/pagos/importar", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error al importar el fichero");
      } else {
        setResultado(data);
        setArchivo(null);
        if (data.tipo === "tipoCambio" && data.ultimaFecha) {
          setUltimaFecha(data.ultimaFecha);
        }
        if (data.tipo === "pagos" && data.pagosNuevos?.length > 0) {
          actualizarUltimoPorBanco(data.banco, data.pagosNuevos);
        }
      }
    } catch (e) {
      setError("No se ha podido conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  async function sincronizarRevolut() {
    setCargandoRevolut(true);
    setErrorRevolut(null);
    setResultado(null);

    try {
      const res = await fetch("/api/revolut/sincronizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desde: fechaDesde }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorRevolut(data.error || "Error al sincronizar con Revolut");
      } else {
        setResultado({ tipo: "revolut", ...data });
        if (data.pagosNuevos?.length > 0) {
          actualizarUltimoPorBanco("Revolut", data.pagosNuevos);
        }
      }
    } catch (e) {
      setErrorRevolut("No se ha podido conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setCargandoRevolut(false);
    }
  }

  async function sincronizarSabadell() {
    setCargandoSabadell(true);
    setErrorSabadell(null);
    setResultado(null);

    try {
      const res = await fetch("/api/sabadell/sincronizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desde: fechaDesdeSabadell }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorSabadell(data.error || "Error al sincronizar con Sabadell");
      } else {
        setResultado({ tipo: "sabadell", ...data });
        if (data.pagosNuevos?.length > 0) {
          actualizarUltimoPorBanco("Sabadell", data.pagosNuevos);
        }
      }
    } catch (e) {
      setErrorSabadell("No se ha podido conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setCargandoSabadell(false);
    }
  }

  async function sincronizarBCE() {
    setCargandoBCE(true);
    try {
      const res = await fetch("/api/tipo-cambio/sincronizar", { method: "POST" });
      const data = await res.json();
      setEjecucionManual({
        origen: "MANUAL",
        ejecutadoEn: data.ejecutadoEn,
        exitoso: data.exitoso,
        mensajeError: data.mensajeError,
        nuevos: data.nuevos,
        actualizados: data.actualizados,
        existentes: data.existentes,
        ultimaFecha: data.ultimaFecha,
        usuarioNombre: "ti",
      });
      if (data.exitoso && data.ultimaFecha) {
        setUltimaFecha(data.ultimaFecha);
      }
    } catch (e) {
      setEjecucionManual({
        origen: "MANUAL",
        ejecutadoEn: new Date().toISOString(),
        exitoso: false,
        mensajeError: "No se ha podido conectar con el servidor",
        usuarioNombre: "ti",
      });
    } finally {
      setCargandoBCE(false);
    }
  }

  return (
    <div className="min-h-screen">
      <div className="bg-navy-950 text-white px-4.5 py-4 flex items-center justify-between sticky top-0 z-20">
        <Link href="/dashboard" className="font-mono text-[13px] text-steel-light">
          ← Inicio
        </Link>
        <div className="font-display font-semibold text-base">Importar</div>
        <div className="w-10" />
      </div>

      <main className="max-w-xl mx-auto w-full px-4 py-6">
        {/* Estado del tipo de cambio, siempre visible */}
        <div
          className={`rounded-xl p-3.5 mb-3 text-[13px] ${
            ultimaFecha
              ? "bg-[#EFF3FF] border border-[#CDD9F7] text-[#2A4FB0]"
              : "bg-amber/10 border border-amber/30 text-amber-ink"
          }`}
        >
          {ultimaFecha ? (
            <>
              Tipo de cambio cargado hasta el <b className="font-mono">{formatFecha(ultimaFecha)}</b>
            </>
          ) : (
            "Todavía no hay ningún tipo de cambio cargado en el sistema"
          )}
        </div>

        {/* Estado de las sincronizaciones automáticas/manuales con el BCE */}
        <div className="space-y-2 mb-3">
          <TarjetaEjecucionBCE titulo="Última descarga automática (BCE)" ejecucion={ejecucionCron} />
          <TarjetaEjecucionBCE titulo="Última actualización manual (BCE)" ejecucion={ejecucionManual} />
        </div>

        <button
          onClick={sincronizarBCE}
          disabled={cargandoBCE}
          className="w-full mb-4 py-3 bg-white border border-line rounded-lg text-[13.5px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <span>🔄</span>
          {cargandoBCE ? "Actualizando..." : "Actualizar tasas del BCE ahora"}
        </button>

        {/* Estado del último pago importado de cada banco */}
        <div className="rounded-xl p-3.5 mb-3 bg-white border border-line text-[13px]">
          <div className="font-mono text-[10.5px] uppercase text-steel mb-2">Últimos pagos importados</div>
          <div className="space-y-2.5">
            {porBanco.map((b) => (
              <div key={b.banco} className="flex justify-between items-start gap-2">
                <span className="font-semibold flex-shrink-0">{b.banco}</span>
                {b.ultimaFecha ? (
                  <div className="text-right">
                    <div className="font-mono text-steel">{formatFecha(b.ultimaFecha)}</div>
                    <div className="text-[11.5px] text-steel mt-0.5">
                      {b.persona}
                      {formatImporteBanco(b) && <span className="font-mono"> · {formatImporteBanco(b)}</span>}
                    </div>
                  </div>
                ) : (
                  <span className="font-mono text-steel">sin pagos todavía</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Botón de sincronización manual con Revolut */}
        <div className="mb-1 flex items-center gap-2">
          <button
            onClick={sincronizarRevolut}
            disabled={cargandoRevolut}
            className="flex-1 py-3 bg-white border border-line rounded-lg text-[13.5px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <span>🔄</span>
            {cargandoRevolut ? "Buscando..." : "Buscar pagos nuevos en Revolut"}
          </button>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="border border-line rounded-lg px-2 py-3 text-[13px] font-mono bg-white w-[132px]"
          />
        </div>
        <div className="text-[11.5px] text-steel mb-4 font-mono">
          Buscando pagos desde el {formatFecha(fechaDesde)}
        </div>

        {errorRevolut && (
          <div className="mb-5 bg-alert-bg border border-[#F3C9C9] rounded-xl p-3.5 text-[13.5px] text-[#8A2E2E]">
            {errorRevolut}
          </div>
        )}

        {/* Conexión / sincronización con Sabadell */}
        {avisoSabadell && (
          <div className="mb-3 bg-teal-bg border border-[#CDE9DF] rounded-xl p-3.5 text-[13.5px] text-[#0F5D45]">
            {avisoSabadell}
          </div>
        )}

        {sabadellConectado ? (
          <>
            <div className="mb-1 flex items-center gap-2">
              <button
                onClick={sincronizarSabadell}
                disabled={cargandoSabadell}
                className="flex-1 py-3 bg-white border border-line rounded-lg text-[13.5px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <span>🔄</span>
                {cargandoSabadell ? "Buscando..." : "Buscar pagos nuevos en Sabadell"}
              </button>
              <input
                type="date"
                value={fechaDesdeSabadell}
                onChange={(e) => setFechaDesdeSabadell(e.target.value)}
                className="border border-line rounded-lg px-2 py-3 text-[13px] font-mono bg-white w-[132px]"
              />
            </div>
            <div className="text-[11.5px] text-steel mb-4 font-mono">
              Buscando pagos desde el {formatFecha(fechaDesdeSabadell)}
            </div>
          </>
        ) : (
          <a
            href="/api/sabadell/authorize"
            className="block w-full mb-4 py-3 bg-white border border-line rounded-lg text-[13.5px] font-semibold text-center"
          >
            🔗 Conectar con Sabadell
          </a>
        )}

        {errorSabadell && (
          <div className="mb-5 bg-alert-bg border border-[#F3C9C9] rounded-xl p-3.5 text-[13.5px] text-[#8A2E2E]">
            {errorSabadell}
          </div>
        )}

        {/* Zona de selección de fichero */}
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-[#C9D2DE] rounded-2xl p-8 text-center bg-[#FBFCFD] cursor-pointer active:bg-[#F3F5F8]"
        >
          <div className="w-11 h-11 mx-auto mb-3 rounded-[10px] bg-navy-950 text-amber flex items-center justify-center text-lg">
            ⇧
          </div>
          <div className="font-display text-[15px] font-semibold mb-1">
            {archivo ? archivo.name : "Toca para elegir el fichero"}
          </div>
          <div className="text-[12.5px] text-steel mb-4">
            Extracto de pagos (Revolut, Sabadell...) o el fichero de tipos de cambio del
            Banco de España — la app detecta automáticamente cuál es
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            className="px-4 py-2 border border-line rounded-lg text-[13px] font-semibold bg-white"
          >
            Seleccionar fichero
          </button>
        </div>

        {archivo && (
          <button
            onClick={importar}
            disabled={cargando}
            className="w-full mt-4 py-3.5 bg-amber text-[#241500] font-bold text-[14.5px] rounded-lg disabled:opacity-60"
          >
            {cargando ? "Importando..." : "Importar"}
          </button>
        )}

        {error && (
          <div className="mt-4 bg-alert-bg border border-[#F3C9C9] rounded-xl p-3.5 text-[13.5px] text-[#8A2E2E]">
            {error}
          </div>
        )}

        {resultado && resultado.tipo === "tipoCambio" && (
          <div className="mt-5">
            <div className="bg-teal-bg border border-[#CDE9DF] rounded-xl p-4 mb-4">
              <div className="font-display font-semibold text-[15px] text-[#0F5D45] mb-2">
                Tipos de cambio importados
              </div>
              <div className="text-[13px] text-[#0F5D45] space-y-1 font-mono">
                <div>Fechas en el fichero: {resultado.totalFichero}</div>
                <div>✓ Nuevas cargadas: {resultado.nuevos}</div>
                <div>· Ya existían: {resultado.existentes}</div>
                {resultado.ultimaFecha && <div>Ahora cargado hasta: {formatFecha(resultado.ultimaFecha)}</div>}
              </div>
            </div>
            <Link
              href="/dashboard"
              className="block text-center mt-5 py-3 bg-navy-950 text-white font-semibold text-[13.5px] rounded-lg"
            >
              Ir al Inicio
            </Link>
          </div>
        )}

        {resultado && resultado.tipo === "pagos" && (
          <div className="mt-5">
            <div className="bg-teal-bg border border-[#CDE9DF] rounded-xl p-4 mb-4">
              <div className="font-display font-semibold text-[15px] text-[#0F5D45] mb-2">
                Importación completada — {resultado.banco}
              </div>
              <div className="text-[13px] text-[#0F5D45] space-y-1 font-mono">
                <div>Contenedor: {resultado.contenedor}</div>
                <div>Filas en el fichero: {resultado.totalFichero}</div>
                <div>✓ Pagos nuevos importados: {resultado.nuevos}</div>
                <div>· Duplicados (ya existían): {resultado.duplicados}</div>
                {resultado.anterioresAlInicio > 0 && (
                  <div>· Descartados por ser anteriores al inicio del contenedor: {resultado.anterioresAlInicio}</div>
                )}
                {resultado.sinTasa > 0 && <div>⚠ Sin tipo de cambio ese día: {resultado.sinTasa}</div>}
              </div>
            </div>

            {resultado.pagosNuevos.length > 0 && <ListaPagosNuevos pagos={resultado.pagosNuevos} />}

            <Link
              href="/dashboard"
              className="block text-center mt-5 py-3 bg-navy-950 text-white font-semibold text-[13.5px] rounded-lg"
            >
              Ir al Inicio y asignar cobradores
            </Link>
          </div>
        )}

        {resultado && resultado.tipo === "revolut" && (
          <div className="mt-5">
            <div className="bg-teal-bg border border-[#CDE9DF] rounded-xl p-4 mb-4">
              <div className="font-display font-semibold text-[15px] text-[#0F5D45] mb-2">
                Sincronización con Revolut completada
              </div>
              <div className="text-[13px] text-[#0F5D45] space-y-1 font-mono">
                <div>Contenedor: {resultado.contenedor}</div>
                <div>Transacciones en Revolut: {resultado.totalRevolut}</div>
                <div>Buscado desde: {formatFecha(resultado.desdeUsado)}</div>
                <div>✓ Pagos nuevos importados: {resultado.nuevos}</div>
                <div>· Duplicados (ya existían): {resultado.duplicados}</div>
                {resultado.anterioresAlInicio > 0 && (
                  <div>· Descartados por ser anteriores al inicio del contenedor: {resultado.anterioresAlInicio}</div>
                )}
                {resultado.sinTasa > 0 && <div>⚠ Sin tipo de cambio ese día: {resultado.sinTasa}</div>}
              </div>
            </div>

            {resultado.pagosNuevos.length > 0 && <ListaPagosNuevos pagos={resultado.pagosNuevos} />}

            <Link
              href="/dashboard"
              className="block text-center mt-5 py-3 bg-navy-950 text-white font-semibold text-[13.5px] rounded-lg"
            >
              Ir al Inicio y asignar cobradores
            </Link>
          </div>
        )}

        {resultado && resultado.tipo === "sabadell" && (
          <div className="mt-5">
            <div className="bg-teal-bg border border-[#CDE9DF] rounded-xl p-4 mb-4">
              <div className="font-display font-semibold text-[15px] text-[#0F5D45] mb-2">
                Sincronización con Sabadell completada
              </div>
              <div className="text-[13px] text-[#0F5D45] space-y-1 font-mono">
                <div>Contenedor: {resultado.contenedor}</div>
                <div>Transacciones en Sabadell: {resultado.totalSabadell}</div>
                <div>Buscado desde: {formatFecha(resultado.desdeUsado)}</div>
                <div>✓ Pagos nuevos importados: {resultado.nuevos}</div>
                <div>· Duplicados (ya existían): {resultado.duplicados}</div>
                {resultado.anterioresAlInicio > 0 && (
                  <div>· Descartados por ser anteriores al inicio del contenedor: {resultado.anterioresAlInicio}</div>
                )}
                {resultado.sinTasa > 0 && <div>⚠ Sin tipo de cambio ese día: {resultado.sinTasa}</div>}
              </div>
            </div>

            {resultado.pagosNuevos.length > 0 && <ListaPagosNuevos pagos={resultado.pagosNuevos} />}

            <Link
              href="/dashboard"
              className="block text-center mt-5 py-3 bg-navy-950 text-white font-semibold text-[13.5px] rounded-lg"
            >
              Ir al Inicio y asignar cobradores
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
