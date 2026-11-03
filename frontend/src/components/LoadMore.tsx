export default function LoadMore({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  if (!total) return null
  return <div className="load-more"><span>Exibindo {Math.min(shown, total)} de {total}</span>{shown < total && <button type="button" className="btn btn--ghost" onClick={onMore}>Carregar mais</button>}</div>
}
