import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/db";
import { adminSettings } from "@/db/schema";
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
        if (credentials.email !== adminEmail) return null;

        // Prefer a bcrypt hash stored via the reset-password flow over the
        // plaintext env var. Falls back to the env var on first boot.
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
            const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";
            passwordOk = credentials.password === adminPassword;
          }
        } catch {
          // DB unavailable — fall back to env var
          const adminPassword = process.env.ADMIN_PASSWORD ?? "admin123";
          passwordOk = credentials.password === adminPassword;
        }

        return passwordOk ? { id: "1", email: adminEmail, name: "Администратор" } : null;
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
      if (user) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        (session.user as typeof session.user & { id: string }).id = token.userId as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET ?? "dev-secret-change-in-production",
});

export { handler as GET, handler as POST };
