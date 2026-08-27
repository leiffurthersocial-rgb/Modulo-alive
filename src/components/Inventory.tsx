'use client';

import { useEngine } from '@/store/engineStore';
import { RESOURCE_LABEL, type ResourceType } from '@/game/core/types';
import { GEAR, GEAR_MAP } from '@/game/data/gear';
import { storageCapacity, storedTotal } from '@/game/sim/world';

/** Everything the settlement owns, grouped the way a quartermaster would. */
const GROUPS: { title: string; items: ResourceType[] }[] = [
  { title: 'Food', items: ['cookedMeat', 'food', 'rawMeat', 'rawFood', 'water'] },
  { title: 'Materials', items: ['wood', 'stone', 'fiber'] },
  { title: 'Medical & Seed', items: ['medicine', 'herbs', 'seeds'] },
  { title: 'Made Goods', items: ['tools'] },
];

const ICONS: Record<string, string> = {
  wood: '🪵',
  stone: '🪨',
  food: '🍲',
  rawFood: '🥔',
  rawMeat: '🥩',
  cookedMeat: '🍖',
  fiber: '🧵',
  herbs: '🌿',
  medicine: '💊',
  water: '💧',
  seeds: '🌱',
  tools: '🔨',
};

const NOTE: Partial<Record<ResourceType, string>> = {
  cookedMeat: 'The best meal in camp — eaten first.',
  food: 'Cooked from produce. Filling and safe.',
  rawMeat: 'From the hunt. Spoils first; cook it before it turns.',
  rawFood: 'Berries and crops. Edible raw, but it can make people ill.',
  water: 'Drunk with meals and used in cooking.',
  wood: 'Felled timber. Every structure needs it.',
  stone: 'Mined rock, for foundations and walls.',
  fiber: 'Reeds and flax, for bedding, rope, hats and vests.',
  medicine: 'Treats wounds and breaks a fever.',
  herbs: 'Healroot, brewed into medicine at a workbench.',
  seeds: 'Sown into tilled beds. Harvests return more than they cost.',
  tools: 'Carried by workers, and needed by some structures.',
};

export default function Inventory({ onClose }: { onClose: () => void }) {
  const engine = useEngine();
  const w = engine.world;
  const cap = storageCapacity(w);
  const used = storedTotal(w);
  const pct = Math.min(100, (used / cap) * 100);

  // What people are physically carrying right now, on top of the stores.
  const carried: Partial<Record<ResourceType, number>> = {};
  for (const c of w.characters) {
    if (!c.alive || !c.carrying) continue;
    carried[c.carrying.res] = (carried[c.carrying.res] ?? 0) + c.carrying.amount;
  }

  const wornCount = (gearId: string) =>
    w.characters.filter(
      (c) =>
        c.alive &&
        (c.equipment.tool === gearId ||
          c.equipment.head === gearId ||
          c.equipment.body === gearId)
    ).length;

  return (
    <section className="inventory">
      <header className="inv-head">
        <h2>Stores</h2>
        <div className="inv-cap">
          <div className="inv-cap-track">
            <div
              className={`inv-cap-fill ${pct > 92 ? 'full' : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span>
            {Math.floor(used)} / {cap}
          </span>
        </div>
        <button className="btn btn-icon" onClick={onClose} title="Close">
          ✕
        </button>
      </header>

      <div className="inv-body">
        {GROUPS.map((group) => (
          <div key={group.title} className="inv-group">
            <h3>{group.title}</h3>
            {group.items.map((r) => {
              const amount = Math.floor(w.stock[r]);
              const inHand = Math.floor(carried[r] ?? 0);
              return (
                <div key={r} className={`inv-row ${amount === 0 ? 'empty' : ''}`}>
                  <span className="inv-icon">{ICONS[r]}</span>
                  <span className="inv-name">{RESOURCE_LABEL[r]}</span>
                  <span className="inv-amount">{amount}</span>
                  {inHand > 0 && (
                    <span className="inv-carried" title="Being carried back to storage">
                      +{inHand} in hand
                    </span>
                  )}
                  <span className="inv-note">{NOTE[r]}</span>
                </div>
              );
            })}
          </div>
        ))}

        <div className="inv-group">
          <h3>Equipment</h3>
          {GEAR.map((g) => {
            const spare = g.id === 'tools' ? Math.floor(w.stock.tools) : (w.gear[g.id] ?? 0);
            const worn = wornCount(g.id);
            return (
              <div key={g.id} className={`inv-row ${spare === 0 && worn === 0 ? 'empty' : ''}`}>
                <span className="inv-icon">{g.slot === 'tool' ? '🔨' : g.slot === 'head' ? '🧢' : '🦺'}</span>
                <span className="inv-name">{GEAR_MAP[g.id].label}</span>
                <span className="inv-amount">{spare}</span>
                {worn > 0 && <span className="inv-carried">{worn} worn</span>}
                <span className="inv-note">{g.desc}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
