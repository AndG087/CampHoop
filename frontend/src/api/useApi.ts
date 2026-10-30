import { useEffect, useState } from 'react'

type ApiState<T> = { data: T | undefined; loading: boolean; error: Error | null }

/**
 * Carrega dados da camada api/ e acompanha o estado.
 * `key` identifica a consulta: quando muda, os dados são buscados de novo.
 */
export function useApi<T>(load: () => Promise<T>, key: string): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ data: undefined, loading: true, error: null })

  useEffect(() => {
    let active = true
    setState((s) => ({ ...s, loading: true, error: null }))
    load().then(
      (data) => active && setState({ data, loading: false, error: null }),
      (error: Error) => active && setState({ data: undefined, loading: false, error }),
    )
    return () => {
      active = false
    }
    // `load` muda a cada render; a consulta é identificada por `key`.
  }, [key])

  return state
}
