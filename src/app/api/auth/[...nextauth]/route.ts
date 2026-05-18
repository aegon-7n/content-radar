import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email" },
        password: { label: "Пароль",  type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const adminEmail    = process.env.ADMIN_EMAIL    ?? "admin@content-radar.ru";
        const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";

        // Bootstrap path for the initial owner account (env-var credentials).
        if (credentials.email === adminEmail && credentials.password === adminPassword) {
          const [user] = await db
            .select({ id: users.id, tenantId: users.tenantId, email: users.email, name: users.name })
            .from(users)
            .where(eq(users.email, adminEmail))
            .limit(1);
          if (!user) return null;
          return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId };
        }

        // Creator path: look up by email, verify bcrypt hash.
        try {
          const [user] = await db
            .select({ id: users.id, tenantId: users.tenantId, email: users.email, name: users.name, passwordHash: users.passwordHash })
            .from(users)
            .where(eq(users.email, credentials.email))
            .limit(1);
          if (user?.passwordHash && await compare(credentials.password, user.passwordHash)) {
            return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId };
          }
        } catch {
          // DB unavailable — fall through.
        }
        return null;
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.tenantId = (user as typeof user & { tenantId: string }).tenantId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        (session.user as typeof session.user & { id: string; tenantId: string }).id = token.userId as string;
        (session.user as typeof session.user & { id: string; tenantId: string }).tenantId = token.tenantId as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production",
});

export { handler as GET, handler as POST };
