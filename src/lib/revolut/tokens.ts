import { prisma } from "@/lib/prisma";
import { generarClientAssertion } from "./jwt";

const REVOLUT_BASE_URL = "https://b2b.revolut.com/api/1.0";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
};

async function guardarToken(accessToken: string, refreshToken: string, expiresIn: number) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  const existente = await prisma.revolutToken.findFirst();
  if (existente) {
    await prisma.revolutToken.update({
      where: { id: existente.id },
      data: { accessToken, refreshToken, expiresAt, actualizadoEn: new Date() },
    });
  } else {
    await prisma.revolutToken.create({
      data: { accessToken, refreshToken, expiresAt },
    });
  }
}

export async function intercambiarCodigoPorTokens(code: string) {
  const clientAssertion = generarClientAssertion();
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: clientAssertion,
  });

  const res = await fetch(`${REVOLUT_BASE_URL}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`Error al intercambiar el código de Revolut: ${res.status} ${texto}`);
  }

  const data: TokenResponse = await res.json();
  if (!data.refresh_token) {
    throw new Error("Revolut no devolvió un refresh_token en el intercambio inicial");
  }

  await guardarToken(data.access_token, data.refresh_token, data.expires_in);
  return data;
}

async function refrescarToken(refreshToken: string) {
  const clientAssertion = generarClientAssertion();
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: clientAssertion,
  });

  const res = await fetch(`${REVOLUT_BASE_URL}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`Error al refrescar el token de Revolut: ${res.status} ${texto}`);
  }

  const data: TokenResponse = await res.json();
  // Revolut normalmente no rota el refresh_token, pero si alguna vez lo hiciera,
  // hay que quedarse con el nuevo en vez de seguir usando el viejo (ya inválido).
  await guardarToken(data.access_token, data.refresh_token || refreshToken, data.expires_in);
  return data.access_token;
}

export async function obtenerAccessTokenRevolut(): Promise<string> {
  const token = await prisma.revolutToken.findFirst();
  if (!token) {
    throw new Error(
      "No hay ninguna conexión con Revolut todavía. Es necesario autorizar la aplicación primero en /api/revolut/authorize"
    );
  }

  const margenSeguridad = 60 * 1000;
  if (token.expiresAt.getTime() - margenSeguridad > Date.now()) {
    return token.accessToken;
  }

  return refrescarToken(token.refreshToken);
}
