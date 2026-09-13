import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@/lib/prisma'
import { isAllowedEmail, isLocalDevelopment, normalizeEmail, verifyPassword } from '@/lib/native-auth'

type LocalGoogleOAuth = { clientId: string; clientSecret: string }

function localGoogleOAuth(): LocalGoogleOAuth | null {
  if (process.env.NODE_ENV !== 'development' || !/^http:\/\/localhost(?::\d+)?$/.test(process.env.NEXTAUTH_URL ?? '')) return null
  try {
    const value = JSON.parse(readFileSync(join(process.cwd(), '.rogeros-local-oauth.json'), 'utf8')) as Partial<LocalGoogleOAuth>
    return typeof value.clientId === 'string' && typeof value.clientSecret === 'string' ? { clientId: value.clientId, clientSecret: value.clientSecret } : null
  } catch { return null }
}

const localOAuth = localGoogleOAuth()

// Pure JWT auth — no DB adapter required.
// Users are verified via allowedEmails; session is a signed cookie.
// TODO: Add PrismaAdapter once DB-backed sessions are needed.
export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  providers: [
    GoogleProvider({
      clientId: localOAuth?.clientId || process.env.GOOGLE_CLIENT_ID!,
      clientSecret: localOAuth?.clientSecret || process.env.GOOGLE_CLIENT_SECRET!,
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
      if (account?.provider === 'credentials') return isAllowedEmail(user.email ?? '')
      // Comma-separated allowlist from env, e.g. ALLOWED_EMAILS="you@example.com,teammate@example.com"
      const verified = account?.provider !== 'google' || (profile as { email_verified?: boolean } | null)?.email_verified === true
      const email = normalizeEmail(user.email ?? '')
      if (!verified || !email || !isAllowedEmail(email)) return false

      // Google supplies a provider-specific account ID. Project memberships belong
      // to RogerOS users, so resolve the Google identity to that local user before
      // its ID is stored in the session token.
      if (account?.provider === 'google') {
        const localUser = await prisma.user.upsert({
          where: { email },
          create: { email, name: user.name ?? null, image: user.image ?? null },
          update: { name: user.name ?? null, image: user.image ?? null },
        })
        user.id = localUser.id

        // An isolated localhost database has a single seeded workspace. Let the
        // signed-in local developer enter it without weakening hosted tenancy.
        if (isLocalDevelopment()) {
          const organization = await prisma.organization.findUnique({ where: { slug: 'local-development' } })
          const project = organization
            ? await prisma.project.findUnique({ where: { organizationId_slug: { organizationId: organization.id, slug: 'local' } } })
            : null
          if (organization && project) {
            const member = await prisma.organizationMember.upsert({
              where: { userId_organizationId: { userId: localUser.id, organizationId: organization.id } },
              create: { userId: localUser.id, organizationId: organization.id, role: 'OWNER' },
              update: { role: 'OWNER' },
            })
            await prisma.projectMember.upsert({
              where: { projectId_organizationMemberId: { projectId: project.id, organizationMemberId: member.id } },
              create: { projectId: project.id, organizationId: organization.id, organizationMemberId: member.id, role: 'OWNER' },
              update: { role: 'OWNER' },
            })
          }
        }
      }

      return true
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
