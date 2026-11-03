/** Browser uses FastAPI. The explicit mock mode also supports the isolated regression suite. */
export const remoteApi = typeof window !== 'undefined' && import.meta.env.VITE_API_MODE !== 'mock'
export let DATA_SEASON = remoteApi ? '2026/27' : '2025/26'
export type SeasonInfo = { season: string; firstGame?: string; lastGame?: string; counts: { teams: number; games: number; athletes: number; completed?: number; scheduled?: number; postponed?: number; excludedGamesWithTbdTeams?: number }; importedAt: string; scope: string }
export type SourceMetadata = { season: string | null; availableSeasons: SeasonInfo[] }
export let SEASON_OPTIONS: SeasonInfo[] = []
const seasonListeners = new Set<() => void>()
export const currentSeason = () => DATA_SEASON
export const subscribeSeason = (listener: () => void) => { seasonListeners.add(listener); return () => { seasonListeners.delete(listener) } }
export function configureSeasons(meta: SourceMetadata) {
  SEASON_OPTIONS = meta.availableSeasons
  let stored: string | null = null
  try { stored = localStorage.getItem('camphoop.season') } catch { /* Storage is optional. */ }
  DATA_SEASON = SEASON_OPTIONS.some((s) => s.season === stored) ? stored! : meta.season ?? DATA_SEASON
  seasonListeners.forEach((listener) => listener())
}
export function selectSeason(season: string) {
  if (!SEASON_OPTIONS.some((s) => s.season === season) || season === DATA_SEASON) return
  DATA_SEASON = season
  try { localStorage.setItem('camphoop.season', season) } catch { /* In-memory selection remains available. */ }
  seasonListeners.forEach((listener) => listener())
  invalidateApi()
}
export const CURRENT_DATE = remoteApi ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date()) : '2025-11-03'
export function calendarFocusDate() {
  const info = SEASON_OPTIONS.find((s) => s.season === DATA_SEASON)
  if (info?.lastGame && CURRENT_DATE > info.lastGame) return info.lastGame
  if (info?.firstGame && CURRENT_DATE < info.firstGame) return info.firstGame
  return CURRENT_DATE
}
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
let revision = 0
const listeners = new Set<() => void>()
let invalidation: ReturnType<typeof setTimeout> | undefined
const pendingReads = new Map<string, Promise<unknown>>()
export const apiRevision = () => revision
export const subscribeApi = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export function invalidateApi() {
  if (invalidation) return
  invalidation = setTimeout(() => { invalidation = undefined; revision++; listeners.forEach((listener) => listener()) }, 40)
}
export function request<T = never>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (method !== 'GET') return performRequest<T>(path, method, body)
  const key = `${DATA_SEASON}:${revision}:${path}`
  const existing = pendingReads.get(key)
  if (existing) return existing as Promise<T>
  const pending = performRequest<T>(path, method, body)
  pendingReads.set(key, pending)
  pending.then(() => pendingReads.delete(key), () => pendingReads.delete(key))
  return pending
}
async function performRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    const url = new URL(`/api${path}`, location.origin)
    if (!path.startsWith('/auth/') && !path.startsWith('/meta') && !url.searchParams.has('season')) url.searchParams.set('season', DATA_SEASON)
    response = await fetch(url, { method, credentials: 'include', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch { throw new ApiError('Não foi possível conectar à API. Confira se o backend está em execução.', 0) }
  const value = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(typeof value?.detail === 'string' ? value.detail : 'Não foi possível concluir a operação.', response.status)
  if (method !== 'GET' && !path.split('?')[0].endsWith('/draft')) invalidateApi()
  return value as T
}
if (remoteApi) {
  let socket: WebSocket | null = null
  let retry: ReturnType<typeof setTimeout>
  const connect = () => {
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/ws`)
    socket.onopen = invalidateApi
    socket.onmessage = (event) => {
      try { if (JSON.parse(event.data).type === 'match.updated') invalidateApi() } catch { /* Ignore malformed messages. */ }
    }
    socket.onclose = () => { retry = setTimeout(connect, 3000) }
    socket.onerror = () => socket?.close()
  }
  connect()
  const fallback = setInterval(() => { if (socket?.readyState !== WebSocket.OPEN) invalidateApi() }, 15000)
  if (import.meta.hot) import.meta.hot.dispose(() => { clearTimeout(retry); clearInterval(fallback); if (socket) { socket.onclose = null; socket.close() } })
}
