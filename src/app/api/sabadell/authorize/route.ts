import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import { authOptions } from "@/lib/auth";
import { iniciarAutorizacionSabadell } from "@/lib/enableBanking/sesion";

const COOKIE_STATE = "sabadell_oauth_state";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const state = crypto.randomBytes(24).toString("hex");

  try {
    const url = await iniciarAutorizacionSabadell(state);
    const res = NextResponse.redirect(url);
    res.cookies.set(COOKIE_STATE, state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 10,
      path: "/",
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Error al iniciar la autorización con Sabadell" }, { status: 500 });
  }
}
