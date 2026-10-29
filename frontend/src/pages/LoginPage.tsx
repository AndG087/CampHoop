import { useLocation, useNavigate } from 'react-router'
import { DEMO_USERS, ROLES, ROLE_INFO, type Role } from '../auth/roles'
import { useSession } from '../auth/session'
import './LoginPage.css'

export default function LoginPage() {
  const { user, signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  function choose(role: Role) {
    signIn(role)
    navigate(from, { replace: true })
  }

  return (
    <div className="login">
      <div className="login__side">
        <div className="brand">
          <span className="brand__ball" aria-hidden="true" />
          <span>
            CampHoop
            <small>GAME ON. GROW TOGETHER.</small>
          </span>
        </div>
        <div className="login__pitch">
          <div className="eyebrow login__eyebrow">BASQUETE DE BASE, CONECTADO</div>
          <h1>O jogo cresce com você.</h1>
          <p>Um espaço para equipes, atletas e comunidades viverem o basquete com mais dados, conexão e propósito.</p>
        </div>
        <small className="login__legal">© 2025 CampHoop · Protótipo demonstrativo</small>
      </div>

      <div className="login__box">
        <div className="login__panel">
          <span className="pill">DEMONSTRAÇÃO · SEM SENHA</span>
          <h2>Escolha um perfil</h2>
          <p className="login__intro">
            Cada perfil mostra o CampHoop com permissões diferentes. Ainda não há login de verdade: troque de perfil quando quiser.
          </p>
          <div className="roles">
            {ROLES.map((role) => {
              const info = ROLE_INFO[role]
              const demo = DEMO_USERS[role]
              const current = user?.role === role
              return (
                <button key={role} type="button" className={`role${current ? ' role--current' : ''}`} onClick={() => choose(role)}>
                  <span className="role__head">
                    <span className="avatar avatar--light" aria-hidden="true">{demo.initials}</span>
                    <span>
                      <b>{info.label}</b>
                      <small>{demo.name} · {demo.context}</small>
                    </span>
                    {current && <span className="pill role__badge">ATUAL</span>}
                  </span>
                  <span className="role__summary">{info.summary}</span>
                  <ul className="role__can">
                    {info.can.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
