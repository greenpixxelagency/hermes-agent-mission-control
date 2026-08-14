import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isInternalServiceBypassAllowed } from '@/lib/internal-service-auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Vercel's NextAuth integration derives OAuth callbacks from the request host.
  // Keep the phase-3 Preview on its stable branch domain before auth so ephemeral
  // deployment URLs never require individual Google OAuth redirect registrations.
  const previewCanonicalUrl = process.env.PREVIEW_CANONICAL_URL;
  if (process.env.VERCEL_ENV === 'preview' && previewCanonicalUrl) {
    const canonicalUrl = new URL(previewCanonicalUrl);
    if (request.nextUrl.host !== canonicalUrl.host) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.protocol = canonicalUrl.protocol;
      redirectUrl.host = canonicalUrl.host;
      return NextResponse.redirect(redirectUrl, 307);
    }
  }

  // DEV-ONLY local bypass (never active on Vercel preview/prod builds).
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  // Skip auth for NextAuth routes, assets, login, and public embeddable charts
  if (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/garden') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname === '/login'
  ) {
    return NextResponse.next();
  }

  // Allow internal agent calls with shared secret
  const internalSecret = request.headers.get('x-internal-secret');
  if (internalSecret && internalSecret === process.env.INTERNAL_API_SECRET && isInternalServiceBypassAllowed(pathname)) {
    return NextResponse.next();
  }

  // Check NextAuth JWT session
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
