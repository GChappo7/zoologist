import { supabase } from './supabase'

export function createWorldId() {
  if(typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function')return crypto.randomUUID()
  return `world-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const EMPTY_GAME_STATE = {
  version: 1,
  worldId: null,
  skillProgress: null,
  mapTiles: null,
  rewardAssignments: null,
  questStatuses: {},
}

export function readLocalGameState() {
  let skillProgress = null
  let mapTiles = null
  let rewardAssignments = null
  let questStatuses = {}
  let diaryStatuses = {}
  let worldId = null
  try { skillProgress = JSON.parse(localStorage.getItem('zoologist-skill-progress') || 'null') } catch {}
  try { mapTiles = JSON.parse(localStorage.getItem('zoologist-map-tiles') || 'null') } catch {}
  try { rewardAssignments = JSON.parse(localStorage.getItem('zoologist-reward-assignments') || 'null') } catch {}
  try { questStatuses = JSON.parse(localStorage.getItem('zoologist-quest-statuses') || '{}') } catch {}
  try { diaryStatuses = JSON.parse(localStorage.getItem('zoologist-diary-statuses') || '{}') } catch {}
  try { worldId = localStorage.getItem('zoologist-world-id') || null } catch {}
  return { ...EMPTY_GAME_STATE, worldId, skillProgress, mapTiles, rewardAssignments, questStatuses, diaryStatuses }
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

export async function verifyCloudGameState(userId, expectedState) {
  if (!supabase || !userId) throw new Error('Cloud save is not available.')
  await saveCloudGameState(userId, expectedState)
  const saved = await loadCloudGameState(userId)
  const expectedWorldId = String(expectedState?.worldId ?? '')
  const actualWorldId = String(saved?.worldId ?? '')
  if (!expectedWorldId || actualWorldId !== expectedWorldId) {
    throw new Error(`Cloud reset verification failed: expected world ${expectedWorldId || '(none)'}, but Supabase returned ${actualWorldId || '(none)'}.`)
  }
  if (saved?.mapTiles != null || saved?.skillProgress != null || saved?.rewardAssignments != null || Object.keys(saved?.questStatuses ?? {}).length > 0) {
    throw new Error('Cloud reset verification failed: Supabase returned progression data instead of a blank world.')
  }
  return saved
}

export async function deleteCloudGameState(userId) {
  if (!supabase || !userId) return
  const { error } = await supabase.from('game_states').delete().eq('user_id', userId)
  if (error) throw error
}

export async function ensureProfile(user) {
  if (!supabase || !user) return
  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Zoologist'
  const { error } = await supabase.from('profiles').upsert({ id: user.id, display_name: displayName })
  if (error) throw error
}
