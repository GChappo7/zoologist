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

export function isFinalSkillBracket(reward, skillMaxLevels = DEFAULT_SKILL_MAX_LEVELS) {
  if (!reward || reward.type !== 'skill' || !reward.skill) return false

  const maxLevel = skillMaxLevels[reward.skill] ?? 99
  const rewardMax = Number(reward.maxLevel ?? reward.max ?? reward.to)
  return Number.isFinite(rewardMax) && rewardMax >= maxLevel
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
  const rewardMin = Number(reward.minLevel ?? reward.min ?? reward.from)

  if (!requiredSkill || !rewardSkill || requiredSkill !== rewardSkill) return false
  if (!Number.isFinite(requiredLevel) || !Number.isFinite(rewardMin)) return false

  return requiredLevel >= rewardMin
}

export function isValidQuestRewardAssignment(creature, reward) {
  if (!creature || !reward || String(reward.type ?? '').toLowerCase() !== 'quest') return true

  const rewardQuest = String(reward.label ?? reward.name ?? '').trim().toLowerCase()
  if (!rewardQuest) return true

  const hardNoRewardQuests = Array.isArray(creature.hardNoRewardQuests)
    ? creature.hardNoRewardQuests
    : []

  return !hardNoRewardQuests.some(quest =>
    String(quest).trim().toLowerCase() === rewardQuest
  )
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
