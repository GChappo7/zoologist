import rewardCatalog from '../data/reward-catalog.json'
import { isValidQuestRewardAssignment, isValidSkillRewardAssignment } from './progressionRules'

const EARLY_RISKY_SKILLS = new Set(['Fishing', 'Slayer', 'Sailing'])

function shuffle(values) {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function rewardKey(reward) {
  return String(reward?.label ?? reward?.name ?? reward?.id ?? '').trim().toLowerCase()
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

function buildUnits() {
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
  return [...skills, ...quests]
}

function isEarlyCreature(creature) {
  return Number(creature?.score) <= 1
}

function makeAssignment(creatures, startCreature) {
  const units = shuffle(buildUnits())
  const adjacency = units.map(unit =>
    creatures.map((creature, creatureIndex) => {
      if (!isCompatible(creature, unit)) return -1

      if (
        isEarlyCreature(creature) &&
        String(unit.type).toLowerCase() === 'skill' &&
        EARLY_RISKY_SKILLS.has(unit.skill)
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

  return assignments
}

export function buildRewardAssignments(creatures, startCreature) {
  const active = (creatures ?? []).filter(c => String(c?.status ?? 'Active').toLowerCase() === 'active')
  const units = buildUnits()

  if (units.length > active.length) {
    throw new Error(`Not enough active creatures for mandatory rewards: ${units.length} rewards / ${active.length} creatures.`)
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = makeAssignment(active, startCreature)
    if (result) return result
  }

  throw new Error('Could not construct a valid unique reward assignment.')
}

export function getAssignedReward(assignments, creature) {
  return assignments?.[String(creature?.id)] ?? null
}
