import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { listNotifications, readAllNotifications, readNotification, type NotificationPage } from '../api/notifications'
import { useSession } from '../auth/session'
import './AccountPages.css'

export default function NotificationsPage() {
  const { user } = useSession()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [data, setData] = useState<NotificationPage | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reload = useCallback(async () => { setBusy(true); setError(''); try { setData(await listNotifications(unreadOnly)) } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar.') } finally { setBusy(false) } }, [unreadOnly, user?.id])
  useEffect(() => { void reload() }, [reload])
  async function mark(id?: string) { setBusy(true); setError(''); try { if (id) await readNotification(id); else await readAllNotifications(); await reload() } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível marcar como lida.'); setBusy(false) } }
  async function more() { if (!data?.nextCursor) return; setBusy(true); try { const next = await listNotifications(unreadOnly, data.nextCursor); setData({ ...next, items: [...data.items, ...next.items.filter((n) => !data.items.some((old) => old.id === n.id))] }) } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar.') } finally { setBusy(false) } }
  return <><div className="page-head"><div><div className="eyebrow">FIQUE POR DENTRO</div><h1>Notificações</h1><p>Convites, vínculos e avisos da sua conta.</p></div><button className="btn btn--ghost" disabled={busy || !data?.unread} onClick={() => void mark()}>Marcar todas como lidas</button></div><div className="account-tabs" role="group" aria-label="Filtrar notificações"><button className="chip" aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>Todas</button><button className="chip" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>Não lidas {data ? `(${data.unread})` : ''}</button><Link className="link-button" to="/conta">Preferências de e-mail →</Link></div>{error && <p className="account-error" role="alert">{error}</p>}{busy && !data && <p role="status">Carregando notificações…</p>}{data?.items.length === 0 && <div className="card account-panel"><h2>Tudo em dia.</h2><p>{unreadOnly ? 'Você leu todas as suas notificações.' : 'Seus avisos aparecerão aqui quando houver novidades.'}</p></div>}<div className="notification-list">{data?.items.map((n) => <article className={`card notification-card${n.readAt ? '' : ' notification-card--unread'}`} key={n.id}><header><h2>{n.title}</h2><time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</time></header><p>{n.body}</p><footer><Link className="link-button" to={n.href} onClick={() => { if (!n.readAt) void readNotification(n.id).catch(() => {}) }}>Abrir →</Link>{!n.readAt && <button className="link-button" disabled={busy} onClick={() => void mark(n.id)}>Marcar como lida</button>}</footer></article>)}</div>{data?.nextCursor && <button className="btn btn--ghost" disabled={busy} onClick={() => void more()}>Carregar mais notificações</button>}</>
}
