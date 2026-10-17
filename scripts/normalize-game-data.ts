import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Building, GameData, Item, Recipe, Resource, ResourceKind } from "../lib/data/types.ts";

type RawRecipe = {
  name: string;
  key_name: string;
  category: string;
  time: number;
  ingredients: [string, number][];
  products: [string, number][];
};

type Raw = {
  belts: { name: string; key_name: string; rate: number }[];
  pipes: { name: string; key_name: string; rate: number }[];
  buildings: {
    name: string;
    key_name: string;
    category: string;
    power: number;
    somersloop_slots: number | null;
    power_range?: [number, number];
  }[];
  miners: { name: string; key_name: string; category: string; base_rate: number; power: number }[];
  items: { name: string; key_name: string }[];
  fluids: { name: string; key_name: string }[];
  recipes: RawRecipe[];
  resources: { key_name: string; category: string }[];
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = JSON.parse(readFileSync(join(root, "data/kirkmcdonald.json"), "utf8")) as Raw;

const BUILDING_NAMES: Record<string, string> = {
  constructor: "Construtor",
  assembler: "Montadora",
  manufacturer: "Fabricador",
  smelter: "Fundidora",
  foundry: "Fundição",
  "oil-refinery": "Refinaria",
  packager: "Empacotadora",
  blender: "Misturador",
  accelerator: "Acelerador de partículas",
  converter: "Conversor",
  "quantum-encoder": "Codificador quântico",
};

const CATEGORY_BUILDING: Record<string, string> = {
  crafting1: "constructor",
  crafting2: "assembler",
  crafting3: "manufacturer",
  smelting1: "smelter",
  smelting2: "foundry",
  refining: "oil-refinery",
  packaging: "packager",
  blending: "blender",
  accelerating: "accelerator",
  converting: "converter",
  encoding: "quantum-encoder",
};

const VARIABLE: Record<string, { range: [number, number]; estimate: boolean }> = {
  accelerator: { range: [250, 750], estimate: true },
  converter: { range: [100, 400], estimate: false },
  "quantum-encoder": { range: [0, 2000], estimate: false },
};

const MINER_NAMES: Record<string, string> = {
  "miner-mk1": "Mineradora Mk.1",
  "miner-mk2": "Mineradora Mk.2",
  "miner-mk3": "Mineradora Mk.3",
};

function resourceKind(id: string, category: string): ResourceKind {
  if (id === "nitrogen-gas") return "nitrogen";
  if (id === "water") return "water";
  if (category === "oil" || id === "crude-oil") return "oil";
  return "mineral";
}

const buildings: Building[] = raw.buildings
  .filter((building) => building.key_name in BUILDING_NAMES)
  .map((building) => {
    const variable = VARIABLE[building.key_name];
    const range = variable?.range ?? building.power_range ?? null;
    const power = range ? (range[0] + range[1]) / 2 : building.power;
    return {
      id: building.key_name,
      name: BUILDING_NAMES[building.key_name] ?? building.name,
      power,
      somersloopSlots: building.somersloop_slots ?? 0,
      variablePower: Boolean(range),
      powerEstimate: variable?.estimate ?? false,
      powerRange: range,
    };
  });

const recipes: Recipe[] = [];
for (const recipe of raw.recipes) {
  const buildingId = CATEGORY_BUILDING[recipe.category];
  if (!buildingId || recipe.time <= 0 || recipe.products.length === 0) continue;
  recipes.push({
    id: recipe.key_name,
    name: recipe.name,
    alternate: recipe.name.startsWith("Alternate:"),
    buildingId,
    duration: recipe.time,
    inputs: recipe.ingredients.map(([itemId, amount]) => ({ itemId, amount })),
    outputs: recipe.products.map(([itemId, amount]) => ({ itemId, amount })),
  });
}

const items: Item[] = [
  ...raw.items.map((item) => ({ id: item.key_name, name: item.name, form: "solid" as const })),
  ...raw.fluids.map((item) => ({ id: item.key_name, name: item.name, form: "fluid" as const })),
];

const resources: Resource[] = raw.resources.map((resource) => ({
  id: resource.key_name,
  kind: resourceKind(resource.key_name, resource.category),
}));

const mineral = raw.miners
  .filter((miner) => miner.category === "mineral")
  .map((miner) => ({
    id: miner.key_name,
    name: MINER_NAMES[miner.key_name] ?? miner.name,
    baseRate: miner.base_rate,
    power: miner.power,
    mk: Number(miner.key_name.slice(-1)),
  }));

const oil = raw.miners.find((miner) => miner.key_name === "oil-pump");
const water = raw.miners.find((miner) => miner.key_name === "water-extractor");
if (!oil || !water) throw new Error("Extratoras de óleo ou água ausentes na fonte.");

const data: GameData = {
  source: "KirkMcDonald/satisfactory-calculator data/data.json",
  gameVersion: "1.0",
  belts: [
    { mk: 1, name: "Esteira Mk.1", rate: 60 },
    { mk: 2, name: "Esteira Mk.2", rate: 120 },
    { mk: 3, name: "Esteira Mk.3", rate: 270 },
    { mk: 4, name: "Esteira Mk.4", rate: 480 },
    { mk: 5, name: "Esteira Mk.5", rate: 780 },
    { mk: 6, name: "Esteira Mk.6", rate: 1200 },
  ],
  pipes: [
    { mk: 1, name: "Cano Mk.1", rate: 300 },
    { mk: 2, name: "Cano Mk.2", rate: 600 },
  ],
  buildings,
  extractors: {
    mineral,
    oil: { id: oil.key_name, name: "Extratora de óleo", baseRate: oil.base_rate, power: oil.power },
    water: {
      id: water.key_name,
      name: "Extratora de água",
      baseRate: water.base_rate,
      power: water.power,
      ignoresPurity: true,
    },
    nitrogen: {
      id: "resource-well",
      name: "Extratora de poço",
      baseRate: 60,
      power: 0,
      ignoresPurity: false,
      pressurizer: { id: "pressurizer", name: "Pressurizador", power: 150 },
    },
  },
  resources,
  items,
  recipes,
};

writeFileSync(join(root, "lib/data/game-data.json"), JSON.stringify(data));
console.log(`itens ${items.length}, receitas ${recipes.length}, prédios ${buildings.length}`);
