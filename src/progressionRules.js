// Zoologist progression rules
//
// Skill rewards are dynamic: a creature can require a higher level than the
// player's current level and still be a valid reward assignment if another
// tile can advance that skill first.
//
// Fishing, Slayer and Sailing have a specific high-level self-reward lock:
// creatures requiring 91+ in one of those skills cannot themselves be assigned
// ANY reward in that same skill. This prevents high-level creatures from
// consuming the progression they are needed to unlock.
//
// Hunter is intentionally excluded because Hunter is automatically unlocked.

import quests from '../data/quests.json'

export const DEFAULT_SKILL_MAX_LEVELS = {
  Attack: 99,
  Strength: 99,
  Defence: 99,
  Ranged: 99,
  Prayer: 99,
  Magic: 99,
  Runecraft: 99,
  Hitpoints: 99,
  Crafting: 99,
  Mining: 99,
  Smithing: 99,
  Fishing: 99,
  Cooking: 99,
  Firemaking: 99,
  Woodcutting: 99,
  Agility: 99,
  Herblore: 99,
  Thieving: 99,
  Fletching: 99,
  Slayer: 99,
  Farming: 99,
  Construction: 99,
  Hunter: 99,
  Sailing: 99,
}

export const HIGH_LEVEL_SELF_REWARD_LOCK_SKILLS = new Set([
  'Fishing',
  'Slayer',
  'Sailing',
])

function getRewardBandBounds(reward) {
  const band = String(reward?.band ?? '').trim()
  const match = band.match(/^(\d+)\s*-\s*(\d+)$/)
  if (!match) return null
  return { min: Number(match[1]), max: Number(match[2]) }
}

export function isFinalSkillBracket(reward, skillMaxLevels = DEFAULT_SKILL_MAX_LEVELS) {
  if (!reward || reward.type !== 'skill' || !reward.skill) return false

  const maxLevel = skillMaxLevels[reward.skill] ?? 99
  const bounds = getRewardBandBounds(reward)
  const rewardMax = Number(reward.maxLevel ?? reward.max ?? reward.to)

  if (Number.isFinite(rewardMax)) return rewardMax >= maxLevel
  return Boolean(bounds && bounds.max >= maxLevel)
}

export function isHighLevelSelfRewardLock(creature) {
  if (!creature) return false

  const requiredSkill = String(creature.requiredSkill ?? '').trim()
  const requiredLevel = Number(creature.requiredLevel)

  if (!HIGH_LEVEL_SELF_REWARD_LOCK_SKILLS.has(requiredSkill)) return false
  if (!Number.isFinite(requiredLevel)) return false

  return requiredLevel >= 91
}

export function isFinalBracketSelfLock(creature, reward, skillMaxLevels = DEFAULT_SKILL_MAX_LEVELS) {
  if (!creature || !reward || reward.type !== 'skill') return false
  if (!isFinalSkillBracket(reward, skillMaxLevels)) return false

  const requiredSkill = String(creature.requiredSkill ?? '').trim().toLowerCase()
  const rewardSkill = String(reward.skill ?? '').trim().toLowerCase()
  const requiredLevel = Number(creature.requiredLevel)
  const rewardMinValue = Number(reward.minLevel ?? reward.min ?? reward.from)
  const rewardMin = Number.isFinite(rewardMinValue)
    ? rewardMinValue
    : getRewardBandBounds(reward)?.min

  if (!requiredSkill || !rewardSkill || requiredSkill !== rewardSkill) return false
  if (!Number.isFinite(requiredLevel) || !Number.isFinite(rewardMin)) return false

  return requiredLevel >= rewardMin
}

function normalizeQuestName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s*\(started\)\s*$/i, '')
    .replace(/\s+/g, ' ')
}

function questRewardKeys(reward) {
  const values = [
    reward?.id,
    reward?.questId,
    reward?.label,
    reward?.name,
    reward?.metadata?.name,
    reward?.reward_metadata?.name,
  ].map(normalizeQuestName).filter(Boolean)

  const record = (quests ?? []).find(quest => {
    const id = normalizeQuestName(quest.id)
    const name = normalizeQuestName(quest.name)
    return values.includes(id) || values.includes(name)
  })

  if (record) {
    values.push(normalizeQuestName(record.id), normalizeQuestName(record.name))
  }

  return new Set(values)
}

export function isValidQuestRewardAssignment(creature, reward) {
  if (!creature || !reward || String(reward.type ?? '').toLowerCase() !== 'quest') return true

  const rewardKeys = questRewardKeys(reward)
  if (!rewardKeys.size) return true

  // A quest cannot be awarded by a creature whose own access requires that
  // quest. Check both explicit hard-no metadata and the prerequisite list so
  // incomplete or mismatched hard-no lists cannot create progression deadlocks.
  const forbiddenQuests = [
    ...(Array.isArray(creature.requiredQuests) ? creature.requiredQuests : []),
    ...(Array.isArray(creature.hardNoRewardQuests) ? creature.hardNoRewardQuests : []),
  ]

  return !forbiddenQuests.some(value => {
    const key = normalizeQuestName(value)
    if (!key) return false
    if (rewardKeys.has(key)) return true

    const record = (quests ?? []).find(quest =>
      normalizeQuestName(quest.id) === key ||
      normalizeQuestName(quest.name) === key
    )
    return Boolean(record && (
      rewardKeys.has(normalizeQuestName(record.id)) ||
      rewardKeys.has(normalizeQuestName(record.name))
    ))
  })
}

export function isValidSkillRewardAssignment(creature, reward, skillMaxLevels = DEFAULT_SKILL_MAX_LEVELS) {
  if (!reward || reward.type !== 'skill') return true

  if (isHighLevelSelfRewardLock(creature)) {
    const requiredSkill = String(creature.requiredSkill ?? '').trim().toLowerCase()
    const rewardSkill = String(reward.skill ?? '').trim().toLowerCase()

    if (requiredSkill === rewardSkill) return false
  }

  return !isFinalBracketSelfLock(creature, reward, skillMaxLevels)
}
