import { useEffect, useRef, type ReactNode } from 'react'
import './Modal.css'

type Props = {
  title: string
  onClose: () => void
  children: ReactNode
}

/** Janela sobre a página, baseada em <dialog>: fecha com Esc, no X ou clicando fora. */
export default function Modal({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="modal__box">
        <header className="modal__head">
          <h2>{title}</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Fechar">×</button>
        </header>
        {children}
      </div>
    </dialog>
  )
}
