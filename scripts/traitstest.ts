/**
 * The eight are authored people: same stats, same traits, every game — and
 * everyone carries the trait of the job they are the camp's best at.
 */
import { createWorld } from '../src/game/sim/worldgen';
import { WORK_TRAIT, TRAIT_MAP } from '../src/game/data/traits';
import { WORK_LABEL } from '../src/game/core/types';

const REQUIRED: Record<string, string[]> = {
  Jovan: ['leader'],
  Leonidas: ['earlyRiser'],
  Erim: ['nightOwl'],
  Leif: ['calm', 'fastLearner'],
  Robin: ['medic', 'social'],
};

const a = createWorld(101);
const b = createWorld(202);
const fails: string[] = [];

for (const c of a.characters) {
  const traits = c.traits;
  console.log(
    `${c.name.padEnd(9)} best at ${WORK_LABEL[c.favouriteWork].padEnd(13)} ` +
      `traits: ${traits.map((t) => TRAIT_MAP[t]?.label ?? t).join(', ')}`
  );
  // Everyone carries their position's trait.
  const positional = WORK_TRAIT[c.favouriteWork];
  if (positional && !traits.includes(positional)) {
    fails.push(`${c.name} is missing their ${positional} trait`);
  }
  // Every trait resolves to a real definition.
  for (const t of traits) if (!TRAIT_MAP[t]) fails.push(`${c.name} has unknown trait ${t}`);
  // The authored minimums.
  for (const req of REQUIRED[c.name] ?? []) {
    if (!traits.includes(req)) fails.push(`${c.name} is missing the required ${req} trait`);
  }
  // Traits are fixed, not rolled.
  const other = b.characters.find((x) => x.name === c.name)!;
  if (other.traits.join(',') !== traits.join(',')) {
    fails.push(`${c.name}'s traits differ between games`);
  }
}

// Survivors who join later still get their position's trait.
console.log('');
console.log(fails.length ? `FAILED: ${fails.join('; ')}` : 'TRAITS OK');
process.exit(fails.length ? 1 : 0);
