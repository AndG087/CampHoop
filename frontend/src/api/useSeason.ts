import { useSyncExternalStore } from 'react'
import { currentSeason, subscribeSeason } from './client'
export const useSeason = () => useSyncExternalStore(subscribeSeason, currentSeason, currentSeason)
