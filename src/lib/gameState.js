import { supabase } from './supabase'

export const EMPTY_GAME_STATE = {
  version: 1,
  skillProgress: null,
  mapTiles: null,
  questStatuses: {},
}

export function readLocalGameState() {
  let skillProgress = null
  let questStatuses = {}
  try { skillProgress = JSON.parse(localStorage.getItem('zoologist-skill-progress') || 'null') } catch {}
  try { questStatuses = JSON.parse(localStorage.getItem('zoologist-quest-statuses') || '{}') } catch {}
  return { ...EMPTY_GAME_STATE, skillProgress, questStatuses }
}

export async function loadCloudGameState(userId) {
  if (!supabase || !userId) return null
  const { data, error } = await supabase.from('game_states').select('game_state').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data?.game_state ?? null
}

export async function saveCloudGameState(userId, gameState) {
  if (!supabase || !userId) return
  const { error } = await supabase.from('game_states').upsert({
    user_id: userId,
    state_version: 1,
    game_state: { ...gameState, version: 1 },
  })
  if (error) throw error
}

export async function ensureProfile(user) {
  if (!supabase || !user) return
  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Zoologist'
  const { error } = await supabase.from('profiles').upsert({ id: user.id, display_name: displayName })
  if (error) throw error
}
