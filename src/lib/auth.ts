import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import { normalizeEmail, verifyPassword } from '@/lib/native-auth'

// Pure JWT auth — no DB adapter required.
// Users are verified via allowedEmails; session is a signed cookie.
// TODO: Add PrismaAdapter once DB-backed sessions are needed.
export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: 'Email and password',
      credentials: { email: { label: 'Email', type: 'email' }, password: { label: 'Password', type: 'password' } },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? normalizeEmail(credentials.email) : ''
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        if (!email || !password) return null
        const user = await prisma.user.findUnique({ where: { email }, include: { credential: true } })
        if (!user?.credential || !await verifyPassword(password, user.credential.passwordHash)) return null
        return { id: user.id, email: user.email, name: user.name, image: user.image }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'credentials') return true
      // Comma-separated allowlist from env, e.g. ALLOWED_EMAILS="you@example.com,teammate@example.com"
      const allowedEmails = (process.env.ALLOWED_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
      if (allowedEmails.length === 0) return false // lock down by default until configured
      const verified = account?.provider !== 'google' || (profile as { email_verified?: boolean } | null)?.email_verified === true
      return verified && allowedEmails.includes(normalizeEmail(user.email ?? ''))
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? ''
        session.user.email = token.email as string
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
}
