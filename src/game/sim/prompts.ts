import type { GamePrompt, PromptOption, World } from '../core/types';
import { RESOURCE_LABEL, type ResourceType } from '../core/types';
import { addResource, log, takeResource } from './world';

/**
 * Prompts are the events that stop and ask the player something.
 *
 * They are plain data so they survive a save, and they are resolved by kind
 * and option id rather than by callback.
 */
export function pushPrompt(
  w: World,
  prompt: Omit<GamePrompt, 'id'>
): GamePrompt {
  const p: GamePrompt = { ...prompt, id: w.nextPromptId++ };
  w.prompts.push(p);
  if (w.prompts.length > 4) w.prompts.splice(0, w.prompts.length - 4);
  return p;
}

export function hasPrompt(w: World, kind: string): boolean {
  return w.prompts.some((p) => p.kind === kind);
}

/**
 * Apply the player's choice.
 * @returns a short line describing what happened, for the notice bar.
 */
export function resolvePrompt(w: World, promptId: number, optionId: string): string {
  const i = w.prompts.findIndex((p) => p.id === promptId);
  if (i < 0) return '';
  const prompt = w.prompts[i];
  w.prompts.splice(i, 1);

  switch (prompt.kind) {
    case 'trader':
      return resolveTrade(w, prompt, optionId);
    case 'newcomer':
      return resolveNewcomer(w, prompt, optionId);
    case 'forager':
      return resolveForager(w, prompt, optionId);
    default:
      return '';
  }
}

/* ------------------------------------------------------------------ */

const TRADE_KEYS: ResourceType[] = [
  'wood',
  'stone',
  'fiber',
  'herbs',
  'medicine',
  'tools',
  'seeds',
  'cookedMeat',
  'food',
];

export function makeTradeOptions(
  w: World,
  giveRes: ResourceType,
  giveAmount: number,
  getRes: ResourceType,
  getAmount: number
): PromptOption[] {
  const canAfford = w.stock[giveRes] >= giveAmount;
  return [
    {
      id: 'accept',
      label: 'Trade',
      desc: `Give ${giveAmount} ${RESOURCE_LABEL[giveRes].toLowerCase()} for ${getAmount} ${RESOURCE_LABEL[getRes].toLowerCase()}.`,
      disabled: !canAfford,
    },
    {
      id: 'decline',
      label: 'Send them on',
      desc: 'Keep what you have. They will not be back for a while.',
    },
  ];
}

function resolveTrade(w: World, p: GamePrompt, optionId: string): string {
  if (optionId !== 'accept') {
    log(w, 'info', 'The Trader Moves On', 'You had nothing to spare. They shouldered their pack and went.', []);
    return 'Trade declined';
  }
  const giveRes = TRADE_KEYS[p.data.giveIndex] ?? 'wood';
  const getRes = TRADE_KEYS[p.data.getIndex] ?? 'food';
  const give = p.data.giveAmount;
  const get = p.data.getAmount;
  if (w.stock[giveRes] < give) return 'Not enough to trade';
  takeResource(w, giveRes, give);
  const stored = addResource(w, getRes, get);
  log(
    w,
    'good',
    'A Fair Trade',
    `Traded ${give} ${RESOURCE_LABEL[giveRes].toLowerCase()} for ${stored} ${RESOURCE_LABEL[getRes].toLowerCase()}.`,
    []
  );
  return `Traded for ${stored} ${RESOURCE_LABEL[getRes].toLowerCase()}`;
}

function resolveNewcomer(w: World, p: GamePrompt, optionId: string): string {
  const id = p.data.charId;
  const c = w.characters.find((x) => x.id === id);
  if (!c) return '';
  if (optionId === 'accept') {
    log(
      w,
      'story',
      'A New Face',
      `${c.name} has joined the settlement. Another mouth, another pair of hands.`,
      [c.id]
    );
    for (const o of w.characters) if (o.alive && o.id !== c.id) o.morale += 3;
    return `${c.name} joined the camp`;
  }
  // Turned away — remove them again.
  const i = w.characters.findIndex((x) => x.id === id);
  if (i >= 0) w.characters.splice(i, 1);
  log(
    w,
    'story',
    'Turned Away',
    `The stranger was sent back into the trees. Nobody felt good about it.`,
    []
  );
  for (const o of w.characters) if (o.alive) o.morale -= 4;
  return 'You turned them away';
}

function resolveForager(w: World, p: GamePrompt, optionId: string): string {
  const res = TRADE_KEYS[p.data.getIndex] ?? 'rawFood';
  if (optionId === 'accept') {
    const stored = addResource(w, res, p.data.getAmount);
    log(
      w,
      'good',
      'Shared Fortune',
      `The wanderer shared their find: ${stored} ${RESOURCE_LABEL[res].toLowerCase()}.`,
      []
    );
    return `Received ${stored} ${RESOURCE_LABEL[res].toLowerCase()}`;
  }
  log(w, 'info', 'Kept Their Distance', 'You waved them past without opening the stores.', []);
  return 'You kept your distance';
}

export { TRADE_KEYS };
