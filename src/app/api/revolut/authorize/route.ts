import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const clientId = process.env.REVOLUT_CLIENT_ID;
  const redirectUri = process.env.REVOLUT_REDIRECT_URI || "https://boomerang-brown.vercel.app/api/revolut/callback";

  if (!clientId) {
    return NextResponse.json({ error: "Falta REVOLUT_CLIENT_ID en las variables de entorno" }, { status: 500 });
  }

  const url = new URL("https://business.revolut.com/app-confirm");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "READ");

  return NextResponse.redirect(url.toString());
}
