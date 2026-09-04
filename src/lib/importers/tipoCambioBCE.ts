import { TasaDetectada } from "./tipoCambio";

// Descarga y parsea el tipo de cambio diario USD/EUR publicado por el BCE.
// Devuelve el mismo formato que procesarTipoCambioBDE, para que ambos
// alimenten la misma función de guardado (guardarTasasCambio en lib/tipoCambio.ts).

const BCE_URL_BASE = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata";

export async function descargarTasasBCE(fechaDesde: string): Promise<TasaDetectada[]> {
  const url = `${BCE_URL_BASE}&startPeriod=${fechaDesde}`;
  const res = await fetch(url, { headers: { Accept: "text/csv" } });
  if (!res.ok) {
    throw new Error(`BCE respondió ${res.status}: ${res.statusText}`);
  }
  const texto = await res.text();
  return procesarTasasBCE(texto);
}

export function procesarTasasBCE(csv: string): TasaDetectada[] {
  const lineas = csv.trim().split("\n");
  if (lineas.length < 2) return [];

  const cabecera = lineas[0].split(",");
  const idxFecha = cabecera.indexOf("TIME_PERIOD");
  const idxValor = cabecera.indexOf("OBS_VALUE");
  if (idxFecha === -1 || idxValor === -1) return [];

  const resultado: TasaDetectada[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const cols = lineas[i].split(",");
    const fecha = cols[idxFecha]?.trim();
    const valorRaw = cols[idxValor]?.trim();
    if (!fecha || !valorRaw) continue;

    const valor = parseFloat(valorRaw);
    if (!valor || isNaN(valor)) continue;

    resultado.push({ fecha, usdPorEur: valor });
  }
  return resultado;
}
