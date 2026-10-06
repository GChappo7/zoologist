import rewardCatalog from '../data/reward-catalog.json'
import { isValidQuestRewardAssignment, isValidSkillRewardAssignment } from './progressionRules'

const EARLY_RISKY_SKILLS = new Set(['Fishing', 'Slayer', 'Sailing'])
const EARLY_REWARD_IDS = new Set(['fishing-1-10', 'quest-novice-5'])

function isForcedEarlyReward(unit) {
  return EARLY_REWARD_IDS.has(String(unit?.id ?? ''))
}

function shuffle(values) {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function rewardKey(reward) {
  return String(reward?.questId ?? reward?.label ?? reward?.name ?? reward?.id ?? '').trim().toLowerCase()
}

function hasUniqueQuestRewards(assignments) {
  const seen = new Set()
  for (const reward of Object.values(assignments ?? {})) {
    if (String(reward?.type ?? '').toLowerCase() !== 'quest') continue
    const key = rewardKey(reward)
    if (!key || seen.has(key)) return false
    seen.add(key)
  }
  return true
}

function isCompatible(creature, reward) {
  if (!creature || !reward) return false

  if (String(reward.type).toLowerCase() === 'quest') {
    if (!isValidQuestRewardAssignment(creature, reward)) return false
    const quest = rewardKey(reward)
    const required = new Set((creature.requiredQuests ?? []).map(q => String(q).trim().toLowerCase()))
    return !required.has(quest)
  }

  if (String(reward.type).toLowerCase() === 'skill') {
    return isValidSkillRewardAssignment(creature, reward)
  }

  return false
}

function buildUnits(activeCreatureCount) {
  const skills = rewardCatalog.lockedSkills.flatMap(skill =>
    Array.from({ length: 10 }, (_, index) => ({
      type: 'skill',
      skill,
      slot: index + 1,
      id: `${skill.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index + 1}`,
    }))
  )
  const quests = rewardCatalog.mandatory
    .filter(reward => String(reward.type).toLowerCase() === 'quest')
    .map(reward => ({ ...reward }))

  // Spare creature slots are deliberately kept useful as bonus skill tiles.
  // When new quests are added, the mandatory quest count grows and these
  // bonus slots are consumed first.
  const spareCount = Math.max(0, activeCreatureCount - skills.length - quests.length)
  const bonusSkills = []
  if (spareCount > 0 && rewardCatalog.lockedSkills.length > 0) {
    const skillOrder = shuffle(rewardCatalog.lockedSkills)
    for (let index = 0; index < spareCount; index += 1) {
      const skill = skillOrder[index % skillOrder.length]
      bonusSkills.push({
        type: 'skill',
        skill,
        bonus: true,
        id: `bonus-${skill.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index + 1}`,
      })
    }
  }

  return [...skills, ...quests, ...bonusSkills]
}
function isEarlyCreature(creature) {
  return Number(creature?.score) <= 1
}

function makeAssignment(creatures, startCreature) {
  const units = shuffle(buildUnits(creatures.length))
  const adjacency = units.map(unit =>
    creatures.map((creature, creatureIndex) => {
      if (!isCompatible(creature, unit)) return -1

      if (
        isEarlyCreature(creature) &&
        String(unit.type).toLowerCase() === 'skill' &&
        EARLY_RISKY_SKILLS.has(unit.skill)
      ) return -1

      // Reserve the first Fishing unlock and Children of the Sun for genuinely
      // accessible creatures. The map generator can then enforce that these
      // rewards are encountered early without making the early game impossible.
      if (
        isForcedEarlyReward(unit) &&
        Number(creature.score) > 2
      ) return -1

      if (
        creature.id === startCreature?.id &&
        String(unit.type).toLowerCase() !== 'skill'
      ) return -1

      return creatureIndex
    }).filter(index => index >= 0)
  )

  const order = adjacency
    .map((edges, index) => ({ index, degree: edges.length }))
    .sort((a, b) => a.degree - b.degree || Math.random() - 0.5)
    .map(item => item.index)

  const creatureMatch = Array(creatures.length).fill(-1)
  const seen = Array(creatures.length).fill(0)
  let stamp = 0

  function tryMatch(unitIndex) {
    for (const creatureIndex of adjacency[unitIndex]) {
      if (seen[creatureIndex] === stamp) continue
      seen[creatureIndex] = stamp

      if (
        creatureMatch[creatureIndex] === -1 ||
        tryMatch(creatureMatch[creatureIndex])
      ) {
        creatureMatch[creatureIndex] = unitIndex
        return true
      }
    }
    return false
  }

  for (const unitIndex of order) {
    stamp += 1
    if (!tryMatch(unitIndex)) return null
  }

  const assignments = {}
  for (let creatureIndex = 0; creatureIndex < creatureMatch.length; creatureIndex += 1) {
    const unitIndex = creatureMatch[creatureIndex]
    if (unitIndex >= 0) {
      assignments[String(creatures[creatureIndex].id)] = units[unitIndex]
    }
  }

  if (!hasUniqueQuestRewards(assignments)) return null
  return assignments
}

export function buildRewardAssignments(creatures, startCreature) {
  const active = (creatures ?? []).filter(c => String(c?.status ?? 'Active').toLowerCase() === 'active')
  const units = buildUnits(active.length)

  if (units.length > active.length) {
    throw new Error(`Not enough active creatures for mandatory rewards: ${units.length} rewards / ${active.length} creatures.`)
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = makeAssignment(active, startCreature)
    if (result) return result
  }

  throw new Error('Could not construct a valid unique reward assignment.')
}

export function hasValidRewardAssignments(assignments) {
  return hasUniqueQuestRewards(assignments)
}

export function getAssignedReward(assignments, creature) {
  return assignments?.[String(creature?.id)] ?? null
}
