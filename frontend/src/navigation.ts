export type NavItem = {
  path: string
  label: string
  icon: string
  /** Rótulo curto para o menu inferior do celular. */
  mobileLabel?: string
  /** Aparece direto no menu inferior do celular; os demais ficam em "Mais". */
  mobile?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Início', icon: '⌂', mobile: true },
  { path: '/times', label: 'Times', icon: '◈', mobile: true },
  { path: '/agenda', label: 'Agenda', icon: '▦', mobile: true },
  { path: '/campeonatos', label: 'Campeonatos', icon: '♜' },
  { path: '/atletas', label: 'Atletas', icon: '◎', mobile: true },
  { path: '/ao-vivo', label: 'Partida ao vivo', mobileLabel: 'Ao vivo', icon: '◉', mobile: true },
  { path: '/quadro-tatico', label: 'Quadro tático', icon: '⌗' },
]

/** Item do menu ativo para o caminho atual (inclui páginas de detalhe, ex.: /times/sub17). */
export function activeNavItem(pathname: string): NavItem | undefined {
  if (pathname === '/') return NAV_ITEMS[0]
  return NAV_ITEMS.find((item) => item.path !== '/' && pathname.startsWith(item.path))
}
