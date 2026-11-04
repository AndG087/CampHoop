import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { notificationCount } from '../api/notifications'
import { remoteApi } from '../api/client'
import { useSession } from '../auth/session'

export default function NotificationBell() {
  const { user } = useSession()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    if (!remoteApi || !user) return
    let active = true
    const reload = () => { void notificationCount().then((data) => { if (active) setUnread(data.unread) }, () => { if (active) setUnread(0) }) }
    reload()
    const timer = setInterval(reload, 30000)
    window.addEventListener('focus', reload); window.addEventListener('camphoop:notifications', reload)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', reload); window.removeEventListener('camphoop:notifications', reload) }
  }, [user?.id])
  return <button type="button" className="notif" aria-label={`Notificações${unread ? `, ${unread} não lidas` : ''}`} onClick={() => navigate('/notificacoes')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>{unread > 0 && <span className="notif__count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}</button>
}
