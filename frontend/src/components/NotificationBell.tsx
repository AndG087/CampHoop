import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { acceptInvitation, listInvitations, type Invitation } from '../api/accounts'
import { listNotifications, notificationCount, readAllNotifications, readNotification, type NotificationPage } from '../api/notifications'
import { remoteApi } from '../api/client'
import { ROLE_INFO } from '../auth/roles'
import { useSession } from '../auth/session'
import './NotificationBell.css'

export type InboxTab = 'avisos' | 'convites'
const OPEN_EVENT = 'camphoop:inbox'

// Pedido de abertura guardado até um sininho montado atendê-lo.
let pendingTab: InboxTab | null = null

/** Abre a central do sininho em uma aba, de qualquer lugar do app. */
export function openInbox(tab: InboxTab = 'avisos') {
  pendingTab = tab
  window.dispatchEvent(new CustomEvent<InboxTab>(OPEN_EVENT, { detail: tab }))
}

/** Endereços antigos (/convites, /notificacoes) abrem a central e voltam ao início. */
export function InboxRedirect({ tab }: { tab: InboxTab }) {
  const navigate = useNavigate()
  useEffect(() => {
    pendingTab = tab
    navigate('/', { replace: true })
  }, [tab])
  return null
}

const INBOX_PATHS: Record<string, InboxTab> = { '/convites': 'convites', '/notificacoes': 'avisos' }
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

export default function NotificationBell() {
  const { user, refresh } = useSession()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<InboxTab>('avisos')
  const [unread, setUnread] = useState(0)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [notes, setNotes] = useState<NotificationPage | null>(null)
  const [invites, setInvites] = useState<Invitation[] | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const canInvite = !!user?.emailVerified && !user?.isDemo
  const pendingInvites = invites?.length ?? 0
  const badge = unread + pendingInvites

  const loadCount = useCallback(() => {
    if (!remoteApi || !user) return
    void notificationCount().then((d) => setUnread(d.unread), () => setUnread(0))
    if (canInvite) void listInvitations().then(setInvites, () => setInvites([]))
    else setInvites([])
  }, [user?.id, canInvite])

  const loadNotes = useCallback(async (onlyUnread: boolean) => {
    if (!remoteApi || !user) return
    try { setNotes(await listNotifications(onlyUnread)); setError('') } catch (e) { setError(message(e, 'Não foi possível carregar os avisos.')) }
  }, [user?.id])

  // Contador: atualiza a cada 30 s, ao voltar para a aba e quando algo é lido.
  useEffect(() => {
    loadCount()
    const timer = setInterval(loadCount, 30000)
    window.addEventListener('focus', loadCount); window.addEventListener('camphoop:notifications', loadCount)
    return () => { clearInterval(timer); window.removeEventListener('focus', loadCount); window.removeEventListener('camphoop:notifications', loadCount) }
  }, [loadCount])

  useEffect(() => {
    const take = () => { if (pendingTab) { setTab(pendingTab); setOpen(true); pendingTab = null } }
    take()
    window.addEventListener(OPEN_EVENT, take)
    return () => window.removeEventListener(OPEN_EVENT, take)
  }, [])

  useEffect(() => { if (open) { void loadNotes(unreadOnly); loadCount() } }, [open, unreadOnly, loadNotes])
  // Fecha ao trocar de página (não na montagem, para não anular um pedido de abertura).
  const lastPath = useRef(pathname)
  useEffect(() => { if (lastPath.current !== pathname) { lastPath.current = pathname; setOpen(false) } }, [pathname])

  // Fecha com Esc ou clicando fora do painel.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onClick = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey); document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [open])

  async function mark(id?: string) {
    setBusy(id ?? 'all'); setError('')
    try { if (id) await readNotification(id); else await readAllNotifications(); await loadNotes(unreadOnly) } catch (e) { setError(message(e, 'Não foi possível marcar como lida.')) } finally { setBusy('') }
  }

  async function more() {
    if (!notes?.nextCursor) return
    setBusy('more')
    try { const next = await listNotifications(unreadOnly, notes.nextCursor); setNotes({ ...next, items: [...notes.items, ...next.items.filter((n) => !notes.items.some((old) => old.id === n.id))] }) } catch (e) { setError(message(e, 'Não foi possível carregar.')) } finally { setBusy('') }
  }

  async function accept(id: string) {
    setBusy(id); setError('')
    try { const result = await acceptInvitation({ invitationId: id }); await refresh(); loadCount(); navigate('/clubes/' + result.clubId) } catch (e) { setError(message(e, 'Não foi possível aceitar.')) } finally { setBusy('') }
  }

  function follow(href: string, id: string, isUnread: boolean) {
    if (isUnread) void readNotification(id).catch(() => {})
    const inboxTab = INBOX_PATHS[href]
    if (inboxTab) setTab(inboxTab)
    else navigate(href)
  }

  return (
    <div className="inbox" ref={root}>
      <button type="button" className="notif" aria-label={`Notificações${badge ? `, ${badge} pendentes` : ''}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {badge > 0 && <span className="notif__count" aria-hidden="true">{badge > 99 ? '99+' : badge}</span>}
      </button>

      {open && (
        <div className="inbox__panel" role="dialog" aria-label="Central de notificações">
          <header className="inbox__head">
            <h2>Notificações</h2>
            <button type="button" className="inbox__close" aria-label="Fechar" onClick={() => setOpen(false)}>×</button>
          </header>
          <div className="inbox__tabs" role="tablist" aria-label="Seções">
            <button type="button" role="tab" aria-selected={tab === 'avisos'} onClick={() => setTab('avisos')}>Avisos{unread > 0 && <span>{unread}</span>}</button>
            <button type="button" role="tab" aria-selected={tab === 'convites'} onClick={() => setTab('convites')}>Convites{pendingInvites > 0 && <span>{pendingInvites}</span>}</button>
          </div>

          {error && <p className="inbox__error" role="alert">{error}</p>}

          {tab === 'avisos' ? (
            <div className="inbox__body" role="tabpanel" aria-label="Avisos">
              <div className="inbox__tools">
                <div className="inbox__filter" role="group" aria-label="Filtrar avisos">
                  <button type="button" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>Todos</button>
                  <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>Não lidos</button>
                </div>
                <button type="button" className="link-button" disabled={!!busy || !unread} onClick={() => void mark()}>Marcar todas como lidas</button>
              </div>
              {!notes && !error && <p className="inbox__empty" role="status">Carregando avisos…</p>}
              {notes?.items.length === 0 && <div className="inbox__empty"><b>Tudo em dia.</b><p>{unreadOnly ? 'Você leu todos os seus avisos.' : 'Seus avisos aparecerão aqui quando houver novidades.'}</p></div>}
              <ul className="inbox__list notification-list">
                {notes?.items.map((n) => (
                  <li key={n.id} className={`inbox__item${n.readAt ? '' : ' inbox__item--unread'}`}>
                    <button type="button" className="inbox__item-main" onClick={() => follow(n.href, n.id, !n.readAt)}>
                      <b>{n.title}</b>
                      <span>{n.body}</span>
                      <time dateTime={n.createdAt}>{when(n.createdAt)}</time>
                    </button>
                    {!n.readAt && <button type="button" className="inbox__read" aria-label={`Marcar "${n.title}" como lida`} title="Marcar como lida" disabled={!!busy} onClick={() => void mark(n.id)}>✓</button>}
                  </li>
                ))}
              </ul>
              {notes?.nextCursor && <button type="button" className="btn btn--ghost inbox__more" disabled={!!busy} onClick={() => void more()}>Carregar mais</button>}
            </div>
          ) : (
            <div className="inbox__body" role="tabpanel" aria-label="Convites">
              {!canInvite ? (
                <div className="inbox__empty"><b>Convites indisponíveis</b><p>Use uma conta real com e-mail confirmado para receber convites. <Link to="/conta">Minha conta →</Link></p></div>
              ) : invites === null ? (
                <p className="inbox__empty" role="status">Carregando convites…</p>
              ) : invites.length === 0 ? (
                <div className="inbox__empty"><b>Nenhum convite pendente.</b><p>Peça ao responsável pelo clube para convidar {user?.email}.</p></div>
              ) : (
                <ul className="inbox__list">
                  {invites.map((i) => (
                    <li key={i.id} className="inbox__item inbox__invite">
                      <div>
                        <b>{i.club}</b>
                        <span>{ROLE_INFO[i.role].label} · válido até {new Date(i.expiresAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <button type="button" className="btn btn--accent" disabled={!!busy} onClick={() => void accept(i.id)}>{busy === i.id ? 'Aceitando…' : 'Aceitar convite'}</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <footer className="inbox__foot"><Link to="/conta">Preferências de e-mail →</Link></footer>
        </div>
      )}
    </div>
  )
}
