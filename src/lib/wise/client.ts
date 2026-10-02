import crypto from "crypto";
import { normalizarClavePrivada } from "@/lib/jwtUtils";

const WISE_BASE_URL = "https://api.wise.com";

function firmarRetoSca(oneTimeToken: string): string {
  const privateKey = process.env.WISE_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Falta WISE_PRIVATE_KEY en las variables de entorno");
  }

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(oneTimeToken);
  signer.end();
  const firma = signer.sign(normalizarClavePrivada(privateKey));
  return firma.toString("base64");
}

/**
 * Llama a la API de Wise con el token personal. Si el endpoint exige SCA
 * (respuesta 403 con cabecera x-2fa-approval, obligatorio en cuentas UE/EEE
 * para leer extractos), firma el reto con la clave privada configurada en
 * Wise y reintenta la misma petición una vez con la firma.
 */
export async function fetchWise(path: string, init?: RequestInit): Promise<Response> {
  const token = process.env.WISE_API_TOKEN;
  if (!token) {
    throw new Error("Falta WISE_API_TOKEN en las variables de entorno");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };

  const primera = await fetch(`${WISE_BASE_URL}${path}`, { ...init, headers });
  if (primera.status !== 403) return primera;

  const oneTimeToken = primera.headers.get("x-2fa-approval");
  if (!oneTimeToken) return primera;

  const firma = firmarRetoSca(oneTimeToken);

  return fetch(`${WISE_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...headers,
      "x-2fa-approval": oneTimeToken,
      "X-Signature": firma,
    },
  });
}
