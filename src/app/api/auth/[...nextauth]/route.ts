import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/db";
import { adminSettings, users } from "@/db/schema";
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

        const adminEmail = process.env.ADMIN_EMAIL ?? "admin@content-radar.ru";

        if (credentials.email === adminEmail) {
          // Admin/owner path: prefer bcrypt hash stored via reset-password flow,
          // fall back to plaintext env var on first boot.
          let passwordOk = false;
          try {
            const [row] = await db
              .select()
              .from(adminSettings)
              .where(eq(adminSettings.key, "password_hash"))
              .limit(1);
            if (row) {
              passwordOk = await compare(credentials.password, row.value);
            } else {
              passwordOk = credentials.password === (process.env.ADMIN_PASSWORD ?? "admin123");
            }
          } catch {
            passwordOk = credentials.password === (process.env.ADMIN_PASSWORD ?? "admin123");
          }
          if (!passwordOk) return null;

          const [user] = await db
            .select({ id: users.id, tenantId: users.tenantId, email: users.email, name: users.name })
            .from(users)
            .where(eq(users.email, adminEmail))
            .limit(1);
          if (!user) return null;
          return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId };
        }

        // Creator path: look up by email, verify bcrypt hash stored in users.password_hash.
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

        // Check non-admin users with bcrypt password_hash
        const [user] = await db
          .select({ id: users.id, tenantId: users.tenantId, email: users.email, name: users.name, passwordHash: users.passwordHash })
          .from(users)
          .where(eq(users.email, credentials.email))
          .limit(1);

        if (!user?.passwordHash) return null;

        const valid = await compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId };
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
