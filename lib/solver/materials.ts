import type { Io } from "../data/types";
import type { Board, Plan } from "./types";

/** Custo de construção por unidade, wiki 1.0. Esteira e cano: um trecho. */
const BUILD_COST: Record<string, Io[]> = {
  constructor: [
    { itemId: "reinforced-iron-plate", amount: 2 },
    { itemId: "cable", amount: 8 },
  ],
  assembler: [
    { itemId: "reinforced-iron-plate", amount: 8 },
    { itemId: "rotor", amount: 4 },
    { itemId: "cable", amount: 10 },
  ],
  manufacturer: [
    { itemId: "motor", amount: 10 },
    { itemId: "modular-frame", amount: 20 },
    { itemId: "plastic", amount: 50 },
    { itemId: "cable", amount: 50 },
  ],
  smelter: [
    { itemId: "iron-rod", amount: 5 },
    { itemId: "wire", amount: 8 },
  ],
  foundry: [
    { itemId: "modular-frame", amount: 10 },
    { itemId: "rotor", amount: 10 },
    { itemId: "concrete", amount: 20 },
  ],
  "oil-refinery": [
    { itemId: "motor", amount: 10 },
    { itemId: "encased-industrial-beam", amount: 10 },
    { itemId: "steel-pipe", amount: 30 },
    { itemId: "copper-sheet", amount: 20 },
  ],
  packager: [
    { itemId: "steel-beam", amount: 20 },
    { itemId: "rubber", amount: 10 },
    { itemId: "plastic", amount: 10 },
  ],
  blender: [
    { itemId: "computer", amount: 10 },
    { itemId: "heavy-modular-frame", amount: 10 },
    { itemId: "motor", amount: 20 },
    { itemId: "aluminum-casing", amount: 50 },
  ],
  accelerator: [
    { itemId: "turbo-motor", amount: 10 },
    { itemId: "supercomputer", amount: 10 },
    { itemId: "fused-modular-frame", amount: 25 },
    { itemId: "cooling-system", amount: 50 },
    { itemId: "quickwire", amount: 500 },
  ],
  converter: [
    { itemId: "fused-modular-frame", amount: 10 },
    { itemId: "cooling-system", amount: 25 },
    { itemId: "radio-control-unit", amount: 50 },
    { itemId: "sam-fluctuator", amount: 100 },
  ],
  "quantum-encoder": [
    { itemId: "turbo-motor", amount: 20 },
    { itemId: "supercomputer", amount: 20 },
    { itemId: "cooling-system", amount: 50 },
    { itemId: "time-crystal", amount: 50 },
    { itemId: "ficsite-trigon", amount: 100 },
  ],
  "miner-mk1": [
    { itemId: "portable-miner", amount: 1 },
    { itemId: "iron-plate", amount: 10 },
    { itemId: "concrete", amount: 10 },
  ],
  "miner-mk2": [
    { itemId: "portable-miner", amount: 2 },
    { itemId: "encased-industrial-beam", amount: 10 },
    { itemId: "steel-pipe", amount: 20 },
    { itemId: "modular-frame", amount: 10 },
  ],
  "miner-mk3": [
    { itemId: "portable-miner", amount: 3 },
    { itemId: "steel-pipe", amount: 50 },
    { itemId: "supercomputer", amount: 5 },
    { itemId: "fused-modular-frame", amount: 10 },
    { itemId: "turbo-motor", amount: 3 },
  ],
  "oil-pump": [
    { itemId: "motor", amount: 15 },
    { itemId: "encased-industrial-beam", amount: 20 },
    { itemId: "cable", amount: 60 },
  ],
  "water-extractor": [
    { itemId: "copper-sheet", amount: 20 },
    { itemId: "reinforced-iron-plate", amount: 10 },
    { itemId: "rotor", amount: 10 },
  ],
  "resource-well": [
    { itemId: "steel-beam", amount: 10 },
    { itemId: "aluminum-casing", amount: 10 },
  ],
  pressurizer: [
    { itemId: "radio-control-unit", amount: 10 },
    { itemId: "heavy-modular-frame", amount: 25 },
    { itemId: "motor", amount: 50 },
    { itemId: "alclad-aluminum-sheet", amount: 50 },
    { itemId: "rubber", amount: 100 },
  ],
  splitter: [
    { itemId: "iron-plate", amount: 2 },
    { itemId: "cable", amount: 2 },
  ],
  merger: [
    { itemId: "iron-plate", amount: 2 },
    { itemId: "iron-rod", amount: 2 },
  ],
  junction: [{ itemId: "copper-sheet", amount: 5 }],
  "belt-1": [{ itemId: "iron-plate", amount: 1 }],
  "belt-2": [{ itemId: "reinforced-iron-plate", amount: 1 }],
  "belt-3": [{ itemId: "steel-beam", amount: 1 }],
  "belt-4": [{ itemId: "encased-industrial-beam", amount: 1 }],
  "belt-5": [{ itemId: "alclad-aluminum-sheet", amount: 1 }],
  "belt-6": [
    { itemId: "ficsite-trigon", amount: 1 },
    { itemId: "time-crystal", amount: 1 },
  ],
  "pipe-1": [{ itemId: "copper-sheet", amount: 1 }],
  "pipe-2": [
    { itemId: "copper-sheet", amount: 2 },
    { itemId: "plastic", amount: 1 },
  ],
};

export type MaterialLine = {
  itemId: string;
  amount: number;
};

export function constructionMaterials(plan: Plan, board: Board): MaterialLine[] {
  const units = new Map<string, number>();
  const addUnits = (id: string, count: number) => {
    if (count <= 0) return;
    units.set(id, (units.get(id) ?? 0) + count);
  };

  for (const group of plan.groups) addUnits(group.buildingId, group.machines.length);
  addUnits("pressurizer", plan.pressurizers);
  addUnits("splitter", board.totals.splitters);
  addUnits("merger", board.totals.mergers);
  addUnits("junction", board.totals.junctions);
  for (const belt of board.totals.belts) addUnits(`belt-${belt.mk}`, belt.count);
  for (const pipe of board.totals.pipes) addUnits(`pipe-${pipe.mk}`, pipe.count);

  const totals = new Map<string, number>();
  for (const [id, count] of units) {
    for (const part of BUILD_COST[id] ?? []) {
      totals.set(part.itemId, (totals.get(part.itemId) ?? 0) + part.amount * count);
    }
  }

  return [...totals.entries()]
    .map(([itemId, amount]) => ({ itemId, amount }))
    .sort((a, b) => b.amount - a.amount || a.itemId.localeCompare(b.itemId));
}
