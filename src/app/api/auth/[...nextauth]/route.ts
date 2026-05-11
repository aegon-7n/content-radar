import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { requireEnv } from "@/lib/env";

const adminEmail = requireEnv("ADMIN_EMAIL");
const adminPassword = requireEnv("ADMIN_PASSWORD");
const nextAuthSecret = requireEnv("NEXTAUTH_SECRET");

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

        if (
          credentials.email    === adminEmail &&
          credentials.password === adminPassword
        ) {
          return { id: "1", email: adminEmail, name: "Администратор" };
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
  secret: nextAuthSecret,
});

export { handler as GET, handler as POST };
