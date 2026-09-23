const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type PagoParaCruce = { id: string; importe: number | null };

/**
 * Recorre los pagos en orden del banco y devuelve el que hace que lo recibido
 * llegue al objetivo, con el importe que se pasa (excedente). null si no llega.
 */
export function calcularCruce(
  pagosEnOrden: PagoParaCruce[],
  objetivo: number
): { indice: number; excedente: number } | null {
  if (objetivo <= 0) return null;
  let acumulado = 0;
  for (let i = 0; i < pagosEnOrden.length; i++) {
    const importe = pagosEnOrden[i].importe;
    if (importe === null || importe <= 0) continue;
    acumulado = round2(acumulado + importe);
    if (acumulado >= objetivo) {
      return { indice: i, excedente: round2(acumulado - objetivo) };
    }
  }
  return null;
}

/** Siguiente nombre: "Contenedor 11" -> "Contenedor 12". */
export function siguienteNombre(nombre: string): string {
  const m = nombre.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return `${nombre} (siguiente)`;
  return `${m[1]}${Number(m[2]) + 1}${m[3]}`;
}

/** Número al final del nombre ("Contenedor 11" -> 11); null si no lo tiene (p.ej. un nombre suelto sin numerar). */
export function extraerNumeroContenedor(nombre: string): number | null {
  const m = nombre.match(/(\d+)\D*$/);
  return m ? Number(m[1]) : null;
}
