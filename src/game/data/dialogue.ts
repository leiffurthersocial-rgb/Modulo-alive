import type { SpeechMood } from '../core/types';

export interface Line {
  text: string;
  mood: SpeechMood;
}

/**
 * Contextual one-liners. The AI picks a bucket based on what is actually
 * happening to the character right now, then picks a line from it.
 */
export const LINES: Record<string, Line[]> = {
  hungry: [
    { text: "I'm starving.", mood: 'sad' },
    { text: 'When did I last eat?', mood: 'sad' },
    { text: 'Something. Anything.', mood: 'sad' },
  ],
  starving: [
    { text: "I can't keep going like this.", mood: 'alarm' },
    { text: 'We need food. Now.', mood: 'alarm' },
  ],
  tired: [
    { text: 'I need a break.', mood: 'sad' },
    { text: 'Just a few hours of sleep...', mood: 'sad' },
    { text: 'My arms are done.', mood: 'sad' },
  ],
  chopping: [
    { text: 'Timber!', mood: 'happy' },
    { text: 'This one is coming down.', mood: 'neutral' },
    { text: 'More wood for the pile.', mood: 'neutral' },
  ],
  building: [
    { text: 'Hold that beam steady.', mood: 'neutral' },
    { text: "It's taking shape.", mood: 'happy' },
    { text: 'Almost got it.', mood: 'neutral' },
  ],
  builtDone: [
    { text: 'That should hold.', mood: 'happy' },
    { text: 'This place is getting bigger.', mood: 'happy' },
  ],
  farming: [
    { text: 'Good soil here.', mood: 'happy' },
    { text: 'These should be up in a few days.', mood: 'neutral' },
  ],
  harvest: [
    { text: 'A real harvest!', mood: 'happy' },
    { text: 'We actually grew this.', mood: 'happy' },
  ],
  cooking: [
    { text: "Don't crowd the fire.", mood: 'neutral' },
    { text: 'Smells better than yesterday.', mood: 'happy' },
  ],
  hauling: [
    { text: 'Coming through.', mood: 'neutral' },
    { text: 'Where does this go?', mood: 'neutral' },
  ],
  hunt: [
    { text: 'Meat tonight.', mood: 'happy' },
    { text: 'Clean shot.', mood: 'happy' },
    { text: 'That will feed everyone.', mood: 'happy' },
  ],
  foraging: [
    { text: 'Berries over here!', mood: 'happy' },
    { text: 'These are safe to eat, I think.', mood: 'neutral' },
  ],
  social: [
    { text: 'Nice work today.', mood: 'happy' },
    { text: 'You holding up?', mood: 'neutral' },
    { text: 'Remember before all this?', mood: 'neutral' },
    { text: "Don't say that where the others hear.", mood: 'neutral' },
  ],
  lonely: [
    { text: 'Quiet out here.', mood: 'sad' },
    { text: 'I miss having neighbours.', mood: 'sad' },
  ],
  stressed: [
    { text: "I can't think straight.", mood: 'alarm' },
    { text: 'Everyone just back off.', mood: 'alarm' },
  ],
  hurt: [
    { text: 'That is going to leave a mark.', mood: 'sad' },
    { text: 'I need this looked at.', mood: 'alarm' },
  ],
  sick: [
    { text: "I don't feel right.", mood: 'sad' },
    { text: 'Keep your distance.', mood: 'sad' },
  ],
  happy: [
    { text: 'Good day.', mood: 'happy' },
    { text: 'We might actually make it.', mood: 'happy' },
  ],
  miserable: [
    { text: 'What are we even doing here?', mood: 'sad' },
    { text: 'This was a mistake.', mood: 'sad' },
  ],
  night: [
    { text: 'Something moved out there.', mood: 'alarm' },
    { text: 'Keep the fire going.', mood: 'neutral' },
  ],
  exploreOut: [
    { text: "I'll be back before dark.", mood: 'neutral' },
    { text: "Let's see what's out there.", mood: 'happy' },
  ],
  exploreBack: [
    { text: 'You will not believe what I found.', mood: 'happy' },
    { text: 'Made it back.', mood: 'neutral' },
  ],
  noFood: [
    { text: 'The stores are empty.', mood: 'alarm' },
    { text: 'We need food, seriously.', mood: 'alarm' },
  ],
  noBeds: [
    { text: 'Where am I supposed to sleep?', mood: 'sad' },
  ],
  storageFull: [
    { text: 'Nowhere to put this.', mood: 'sad' },
  ],
  grief: [
    { text: "I can't believe they're gone.", mood: 'sad' },
    { text: 'We should have done more.', mood: 'sad' },
  ],
};

export function pickLine(bucket: string, roll: number): Line | null {
  const arr = LINES[bucket];
  if (!arr || !arr.length) return null;
  return arr[Math.floor(roll * arr.length) % arr.length];
}
