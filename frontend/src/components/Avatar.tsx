import { initials } from '../format'
import './Avatar.css'

type Props = {
  name: string
  photoUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
}

/** Foto do atleta; enquanto não houver foto, mostra as iniciais. */
export default function Avatar({ name, photoUrl, size = 'sm' }: Props) {
  return (
    <span className={`player-avatar player-avatar--${size}`} aria-hidden="true">
      {photoUrl ? <img src={photoUrl} alt="" /> : initials(name)}
    </span>
  )
}
