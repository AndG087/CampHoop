import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { changeRoster, type RosterChange } from '../api/management'
import type { AthleteSummary } from '../api/types'
import Modal from '../components/Modal'
import './RosterDialogs.css'

const message = (e: unknown) => (e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.')

/** Selos públicos de capitão e titular ao lado do nome. */
export function RosterBadges({ athlete }: { athlete: AthleteSummary }) {
  return (
    <>
      {athlete.captain && <span className="roster-badge roster-badge--captain" title="Capitão">C</span>}
      {athlete.starter && <span className="roster-badge" title="Titular">TITULAR</span>}
    </>
  )
}

type Dialog = 'number' | 'remove' | null

/** Menu de ações do técnico para um atleta do próprio elenco. */
export function RosterActions({ athlete, onNotice }: { athlete: AthleteSummary; onNotice: (text: string, error?: boolean) => void }) {
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [busy, setBusy] = useState(false)
  const out = athlete.status === 'desligado'

  // O menu fica fixo na tela para não ser cortado pela rolagem da tabela.
  function toggle() {
    if (place) return setPlace(null)
    const r = button.current!.getBoundingClientRect()
    const width = 220
    setPlace({ top: r.bottom + 6, left: Math.max(8, Math.min(r.right - width, innerWidth - width - 8)) })
  }

  useEffect(() => {
    if (!place) return
    const close = () => setPlace(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); button.current?.focus() } }
    const onDown = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close() }
    document.addEventListener('keydown', onKey); document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close)
    menu.current?.querySelector('button')?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [place])

  async function run(change: RosterChange, done: string) {
    setPlace(null); setBusy(true)
    try { await changeRoster(athlete.id, athlete.revision ?? 1, change); setDialog(null); onNotice(done) } catch (e) { onNotice(message(e), true) } finally { setBusy(false) }
  }

  return (
    <>
      <button ref={button} type="button" className="roster-actions__toggle" aria-haspopup="menu" aria-expanded={!!place} aria-label={`Gerenciar ${athlete.name}`} disabled={busy} onClick={toggle}>
        {busy ? '…' : <><span className="roster-actions__label">Gerenciar ▾</span><span className="roster-actions__dots" aria-hidden="true">⋯</span></>}
      </button>
      {place && (
        <div ref={menu} className="roster-actions__menu" role="menu" aria-label={`Ações para ${athlete.name}`} style={place}>
          {out ? (
            <button type="button" role="menuitem" onClick={() => void run({ inRoster: true }, `${athlete.name} voltou ao elenco.`)}>Inserir no time</button>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => { setPlace(null); setDialog('number') }}>Alterar número da camisa</button>
              <button type="button" role="menuitem" onClick={() => void run({ captain: !athlete.captain }, athlete.captain ? `Capitania retirada: ${athlete.name}.` : `Capitania definida: ${athlete.name}.`)}>{athlete.captain ? 'Remover capitania' : 'Definir como capitão'}</button>
              <button type="button" role="menuitem" onClick={() => void run({ starter: !athlete.starter }, athlete.starter ? `${athlete.name} saiu dos titulares.` : `${athlete.name} está entre os titulares.`)}>{athlete.starter ? 'Tirar dos titulares' : 'Definir como titular'}</button>
              <button type="button" role="menuitem" className="roster-actions__danger" onClick={() => { setPlace(null); setDialog('remove') }}>Remover do time</button>
            </>
          )}
        </div>
      )}
      {/* Janelas fora da tabela: dentro da célula herdariam alinhamento e quebra de linha. */}
      {dialog === 'number' && createPortal(<NumberDialog athlete={athlete} busy={busy} onClose={() => setDialog(null)} onSave={(number) => void run({ number }, `Camisa de ${athlete.name} atualizada.`)} />, document.body)}
      {dialog === 'remove' && createPortal(
        <Modal title="Remover do time" onClose={() => { if (!busy) setDialog(null) }}>
          <div className="roster-form">
            <p>Remover <strong>{athlete.name}</strong> do elenco de {athlete.team.name}?</p>
            <p className="roster-form-hint">Jogos, estatísticas e a conta do atleta são preservados. A camisa fica livre, e a capitania e a vaga de titular são retiradas. Depois, é possível inserir o atleta no time de novo.</p>
            <div className="roster-form-actions">
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setDialog(null)}>Cancelar</button>
              <button type="button" className="btn btn--accent" disabled={busy} onClick={() => void run({ inRoster: false }, `${athlete.name} saiu do elenco.`)}>{busy ? 'Removendo…' : 'Remover do time'}</button>
            </div>
          </div>
        </Modal>,
        document.body,
      )}
    </>
  )
}

function NumberDialog({ athlete, busy, onClose, onSave }: { athlete: AthleteSummary; busy: boolean; onClose: () => void; onSave: (number: number | null) => void }) {
  const [value, setValue] = useState(athlete.number?.toString() ?? '')
  function submit(e: FormEvent) { e.preventDefault(); onSave(value === '' ? null : Number(value)) }
  return (
    <Modal title="Alterar número da camisa" onClose={() => { if (!busy) onClose() }}>
      <form className="roster-form" onSubmit={submit}>
        <p className="roster-form-intro">{athlete.name} · {athlete.team.name}</p>
        <label>Número da camisa<input autoFocus type="number" min={0} max={99} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Sem número" /></label>
        <p className="roster-form-hint">De 0 a 99. Deixe em branco para tirar o número. Cada número só pode ser usado por um atleta do elenco.</p>
        <div className="roster-form-actions">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onClose}>Cancelar</button>
          <button className="btn btn--accent" disabled={busy}>{busy ? 'Salvando…' : 'Salvar número'}</button>
        </div>
      </form>
    </Modal>
  )
}
