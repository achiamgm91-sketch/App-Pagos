import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

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

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

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
