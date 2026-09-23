import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const LIMITE_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        usuario: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.usuario || !credentials?.password) return null;

        const user = await prisma.usuario.findUnique({
          where: { usuario: credentials.usuario },
        });
        if (!user) return null;

        if (user.bloqueadoHasta && user.bloqueadoHasta.getTime() > Date.now()) {
          const minutos = Math.ceil((user.bloqueadoHasta.getTime() - Date.now()) / 60000);
          throw new Error(
            `Demasiados intentos fallidos. Vuelve a intentarlo en ${minutos} minuto${minutos === 1 ? "" : "s"}.`
          );
        }

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) {
          const intentos = user.intentosFallidos + 1;
          await prisma.usuario.update({
            where: { id: user.id },
            data:
              intentos >= LIMITE_INTENTOS
                ? { intentosFallidos: 0, bloqueadoHasta: new Date(Date.now() + MINUTOS_BLOQUEO * 60000) }
                : { intentosFallidos: intentos },
          });
          return null;
        }

        if (user.intentosFallidos > 0 || user.bloqueadoHasta) {
          await prisma.usuario.update({
            where: { id: user.id },
            data: { intentosFallidos: 0, bloqueadoHasta: null },
          });
        }

        return {
          id: user.id,
          name: user.nombre ?? user.usuario,
          usuario: user.usuario,
          rol: user.rol,
          cobradorId: user.cobradorId,
          debeCambiarPassword: user.debeCambiarPassword,
          verTodosPagos: user.verTodosPagos,
          permisos: user.permisos,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = (user as any).id;
        token.usuario = (user as any).usuario;
        token.rol = (user as any).rol;
        token.cobradorId = (user as any).cobradorId ?? null;
        token.debeCambiarPassword = (user as any).debeCambiarPassword ?? false;
        token.verTodosPagos = (user as any).verTodosPagos ?? false;
        token.permisos = (user as any).permisos ?? [];
      }
      if (trigger === "update" && session) {
        Object.assign(token, session);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).usuario = token.usuario;
        (session.user as any).rol = token.rol;
        (session.user as any).cobradorId = token.cobradorId ?? null;
        (session.user as any).debeCambiarPassword = token.debeCambiarPassword ?? false;
        (session.user as any).verTodosPagos = token.verTodosPagos ?? false;
        (session.user as any).permisos = token.permisos ?? [];
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
