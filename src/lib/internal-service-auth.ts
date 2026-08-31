const INTERNAL_SERVICE_PATHS = new Set([
  '/api/cron/x-stats',
  '/api/trends/update',
  '/api/watchlist-radar/update',
  '/api/youtube/ideas',
])

export function isInternalServiceBypassAllowed(pathname: string) {
  return INTERNAL_SERVICE_PATHS.has(pathname)
}

export function isSignedRuntimeCallbackPath(pathname: string) {
  return pathname === '/api/runtime/callback'
}
