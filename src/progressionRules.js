// Zoologist progression rules
//
// Skill rewards are dynamic: a creature can require a higher level than the
// player's current level and still be a valid reward assignment if another
// tile can advance that skill first.
//
// The only creature/skill hard lock handled here is the final-bracket
// self-lock:
//   creature requires Skill X at a level in Skill X's final bracket
//   AND the creature itself rewards that final bracket of Skill X.
// In that situation the creature cannot be used for that reward because the
// reward is required to reach the level needed to complete the creature.

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

export function isFinalSkillBracket(reward, skillMaxLevels = DEFAULT_SKILL_MAX_LEVELS) {
  if (!reward || reward.type !== 'skill' || !reward.skill) return false

  const maxLevel = skillMaxLevels[reward.skill] ?? 99
  const rewardMax = Number(reward.maxLevel ?? reward.max ?? reward.to)
  return Number.isFinite(rewardMax) && rewardMax >= maxLevel
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

  // A creature requiring a level inside the final bracket cannot itself
  // provide that final bracket.
  return requiredLevel >= rewardMin
}

export function isValidSkillRewardAssignment(creature, reward, skillMaxLevels = DEFAULT_SKILL_MAX_LEVELS) {
  return !isFinalBracketSelfLock(creature, reward, skillMaxLevels)
}
