import type { Building, Extractor, GameData, Recipe, ResourceKind } from "../data/types";
import { amplification, clocksForRate, powerMw, shardsForClock } from "./rates";
import type { FlowRate, MachineUnit, Plan, PlanRequest, ProductionGroup } from "./types";

const EPS = 1e-4;

const PURITY: Record<PlanRequest["purity"], number> = {
  impure: 0.5,
  normal: 1,
  pure: 2,
};

type Built = {
  group: ProductionGroup;
  inputs: Map<string, number>;
  outputs: Map<string, number>;
};

export function expand(data: GameData, request: PlanRequest): Plan {
  const items = new Map(data.items.map((item) => [item.id, item]));
  const buildings = new Map(data.buildings.map((building) => [building.id, building]));
  const resources = new Map(data.resources.map((resource) => [resource.id, resource.kind]));
  const recipesByItem = new Map<string, Recipe[]>();
  for (const recipe of data.recipes) {
    for (const output of recipe.outputs) {
      const list = recipesByItem.get(output.itemId) ?? [];
      list.push(recipe);
      recipesByItem.set(output.itemId, list);
    }
  }

  const pool = new Map<string, number>();
  const quotas = new Map<string, number>();
  const chosen = new Map<string, { extractor: boolean; recipe: Recipe | null }>();
  const warnings: string[] = [];
  const unmet = new Set<string>();

  function nameOf(itemId: string): string {
    return items.get(itemId)?.name ?? itemId;
  }

  function choose(itemId: string): { extractor: boolean; recipe: Recipe | null } {
    const cached = chosen.get(itemId);
    if (cached) return cached;
    const override = request.overrides[itemId]?.recipeId;
    const recipes = recipesByItem.get(itemId) ?? [];
    const resource = resources.get(itemId);
    let choice: { extractor: boolean; recipe: Recipe | null };
    if (override === "extract") {
      choice = { extractor: true, recipe: null };
    } else if (override) {
      choice = { extractor: false, recipe: recipes.find((recipe) => recipe.id === override) ?? null };
    } else if (resource) {
      choice = { extractor: true, recipe: null };
    } else {
      choice = { extractor: false, recipe: defaultRecipe(recipes, itemId) };
    }
    if (!choice.extractor && !choice.recipe) {
      if (resource) choice = { extractor: true, recipe: null };
      else unmet.add(itemId);
    }
    if (choice.extractor && !resource) {
      warnings.push(`${nameOf(itemId)} não é um recurso extraível.`);
      choice = { extractor: false, recipe: choice.recipe };
      unmet.add(itemId);
    }
    chosen.set(itemId, choice);
    return choice;
  }

  function requireItem(itemId: string, rate: number, stack: string[]) {
    if (rate <= EPS) return;
    const credit = pool.get(itemId) ?? 0;
    const take = Math.min(credit, rate);
    if (take > 0) pool.set(itemId, credit - take);
    rate -= take;
    if (rate <= EPS) return;
    if (stack.includes(itemId)) {
      warnings.push(`Ciclo de receitas ao produzir ${nameOf(itemId)}.`);
      return;
    }
    const choice = choose(itemId);
    quotas.set(itemId, (quotas.get(itemId) ?? 0) + rate);
    if (choice.extractor || !choice.recipe) return;
    const clock = groupClock(request, itemId);
    const filled = groupSloop(request, itemId, buildings.get(choice.recipe.buildingId));
    const slots = buildings.get(choice.recipe.buildingId)?.somersloopSlots ?? 0;
    const { inputs, extras } = idealRates(choice.recipe, itemId, rate, clock, filled, slots);
    for (const [extraId, extraRate] of extras) {
      pool.set(extraId, (pool.get(extraId) ?? 0) + extraRate);
    }
    for (const [inputId, inputRate] of inputs) {
      requireItem(inputId, inputRate, [...stack, itemId]);
    }
  }

  const targets = mergeTargets(request, items, warnings);
  for (const target of targets) requireItem(target.itemId, target.rate, []);

  const groups: ProductionGroup[] = [];
  for (const [itemId, quota] of quotas) {
    const choice = chosen.get(itemId);
    if (!choice || unmet.has(itemId) || (!choice.extractor && !choice.recipe)) {
      groups.push(unmetGroup(itemId, nameOf(itemId)));
      continue;
    }
    if (choice.extractor) {
      const kind = resources.get(itemId);
      if (!kind) {
        groups.push(unmetGroup(itemId, nameOf(itemId)));
        continue;
      }
      groups.push(buildExtractor(data, request, itemId, nameOf(itemId), quota, kind).group);
      continue;
    }
    const building = buildings.get(choice.recipe!.buildingId);
    if (!building) {
      groups.push(unmetGroup(itemId, nameOf(itemId)));
      continue;
    }
    groups.push(buildRecipe(request, itemId, quota, choice.recipe!, building).group);
  }

  const produced = new Map<string, number>();
  const consumed = new Map<string, number>();
  for (const group of groups) {
    for (const machine of group.machines) {
      for (const output of machine.outputs) addMap(produced, output.itemId, output.rate);
      for (const input of machine.inputs) addMap(consumed, input.itemId, input.rate);
    }
  }
  for (const target of targets) addMap(consumed, target.itemId, target.rate);

  const sinks: FlowRate[] = [];
  const itemIds = new Set([...produced.keys(), ...consumed.keys()]);
  for (const itemId of itemIds) {
    const extra = (produced.get(itemId) ?? 0) - (consumed.get(itemId) ?? 0);
    if (extra > 0.05) sinks.push({ itemId, rate: extra });
  }

  const pressurizers = groups.some((group) => group.extractorKind === "nitrogen") ? 1 : 0;

  return {
    targets,
    groups,
    sinks,
    warnings,
    pressurizers,
    pressurizerPower: pressurizers * data.extractors.nitrogen.pressurizer.power,
  };
}

function mergeTargets(
  request: PlanRequest,
  items: Map<string, { name: string }>,
  warnings: string[],
): PlanRequest["targets"] {
  const merged = new Map<string, number>();
  const order: string[] = [];
  for (const target of request.targets) {
    if (!items.has(target.itemId)) {
      warnings.push("Item da meta não existe nos dados do jogo.");
      continue;
    }
    if (!Number.isFinite(target.rate) || target.rate <= EPS) continue;
    if (!merged.has(target.itemId)) order.push(target.itemId);
    merged.set(target.itemId, (merged.get(target.itemId) ?? 0) + target.rate);
  }
  return order.map((itemId) => ({ itemId, rate: merged.get(itemId) ?? 0 }));
}

function defaultRecipe(recipes: Recipe[], itemId: string): Recipe | null {
  const standard = recipes.filter((recipe) => !recipe.alternate && !isSecondaryName(recipe.name));
  const pool = standard.length > 0 ? standard : recipes.filter((recipe) => !recipe.alternate);
  const candidates = pool.length > 0 ? pool : recipes;
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => scoreRecipe(b, itemId) - scoreRecipe(a, itemId))[0] ?? null;
}

function isSecondaryName(name: string): boolean {
  return name.startsWith("Residual") || name.startsWith("Unpackage") || name.startsWith("Reactor");
}

function scoreRecipe(recipe: Recipe, itemId: string): number {
  const index = recipe.outputs.findIndex((output) => output.itemId === itemId);
  const output = recipe.outputs[index];
  if (!output) return -1;
  const perMinute = (output.amount / recipe.duration) * 60;
  return (index === 0 ? 1000 : 0) + perMinute;
}

function groupClock(request: PlanRequest, itemId: string): number {
  return clampClock(request.overrides[itemId]?.clock ?? request.globalClock);
}

function groupSloop(request: PlanRequest, itemId: string, building: Building | undefined): number {
  const slots = building?.somersloopSlots ?? 0;
  if (slots <= 0) return 0;
  const enabled = request.overrides[itemId]?.somersloops ?? request.somersloops;
  return enabled ? slots : 0;
}

function clampClock(clock: number): number {
  if (!Number.isFinite(clock)) return 100;
  return Math.min(250, Math.max(1, clock));
}

function idealRates(
  recipe: Recipe,
  itemId: string,
  rate: number,
  clock: number,
  filled: number,
  slots: number,
): { inputs: Map<string, number>; extras: Map<string, number> } {
  const amp = amplification(filled, slots);
  const primary = recipe.outputs.find((output) => output.itemId === itemId);
  const inputs = new Map<string, number>();
  const extras = new Map<string, number>();
  if (!primary || primary.amount <= 0) return { inputs, extras };
  const perMachine = (primary.amount / recipe.duration) * 60 * (clock / 100) * amp;
  const machines = rate / perMachine;
  const cycle = (clock / 100) * (60 / recipe.duration);
  for (const input of recipe.inputs) {
    inputs.set(input.itemId, machines * input.amount * cycle);
  }
  for (const output of recipe.outputs) {
    if (output.itemId === itemId) continue;
    extras.set(output.itemId, machines * output.amount * cycle * amp);
  }
  return { inputs, extras };
}

function buildRecipe(
  request: PlanRequest,
  itemId: string,
  quota: number,
  recipe: Recipe,
  building: Building,
): Built {
  const clock = groupClock(request, itemId);
  const filled = groupSloop(request, itemId, building);
  const amp = amplification(filled, building.somersloopSlots);
  const primary = recipe.outputs.find((output) => output.itemId === itemId)!;
  const per100 = (primary.amount / recipe.duration) * 60;
  const clocks = clocksForRate(quota, per100, clock, amp);
  const machines = clocks.map((machineClock, index) =>
    machineFromClock(index, machineClock, recipe, building, filled),
  );
  return {
    group: {
      id: itemId,
      kind: "recipe",
      itemId,
      recipeId: recipe.id,
      recipeName: recipe.name,
      buildingId: building.id,
      buildingName: building.name,
      machines,
      somersloopFilled: filled,
      somersloopSlots: building.somersloopSlots,
      variablePower: building.variablePower,
      powerEstimate: building.powerEstimate,
    },
    inputs: sumIo(machines, "inputs"),
    outputs: sumIo(machines, "outputs"),
  };
}

function machineFromClock(
  index: number,
  clock: number,
  recipe: Recipe,
  building: Building,
  filled: number,
): MachineUnit {
  const amp = amplification(filled, building.somersloopSlots);
  const cycle = (clock / 100) * (60 / recipe.duration);
  return {
    index,
    clock,
    power: powerMw(building.power, clock, filled, building.somersloopSlots),
    shards: shardsForClock(clock),
    inputs: recipe.inputs.map((input) => ({ itemId: input.itemId, rate: input.amount * cycle })),
    outputs: recipe.outputs.map((output) => ({
      itemId: output.itemId,
      rate: output.amount * cycle * amp,
    })),
  };
}

function buildExtractor(
  data: GameData,
  request: PlanRequest,
  itemId: string,
  itemName: string,
  quota: number,
  kind: ResourceKind,
): Built {
  const extractor = extractorFor(data, request, kind);
  const purityFactor = extractor.ignoresPurity ? 1 : PURITY[request.purity];
  const clock = groupClock(request, itemId);
  const per100 = extractor.baseRate * purityFactor;
  const clocks =
    kind === "mineral" ? fullExtractorClocks(quota, per100, clock) : clocksForRate(quota, per100, clock, 1);
  const machines: MachineUnit[] = clocks.map((machineClock, index) => {
    const rate = per100 * (machineClock / 100);
    return {
      index,
      clock: machineClock,
      power: powerMw(extractor.power, machineClock, 0, 0),
      shards: shardsForClock(machineClock),
      inputs: [],
      outputs: [{ itemId, rate }],
    };
  });
  const group: ProductionGroup = {
    id: itemId,
    kind: "extractor",
    itemId,
    recipeId: null,
    recipeName: itemName,
    buildingId: extractor.id,
    buildingName: extractor.name,
    machines,
    somersloopFilled: 0,
    somersloopSlots: 0,
    variablePower: false,
    powerEstimate: false,
    extractorKind: kind,
    purity: extractor.ignoresPurity ? undefined : request.purity,
    minerMk: extractor.mk,
  };
  return { group, inputs: new Map(), outputs: sumIo(machines, "outputs") };
}

function fullExtractorClocks(quota: number, per100: number, clock: number): number[] {
  const each = per100 * (clock / 100);
  if (quota <= EPS || each <= EPS) return [];
  const count = Math.ceil((quota - EPS) / each);
  return Array.from({ length: count }, () => clock);
}

function extractorFor(data: GameData, request: PlanRequest, kind: ResourceKind): Extractor {
  if (kind === "oil") return data.extractors.oil;
  if (kind === "water") return data.extractors.water;
  if (kind === "nitrogen") return data.extractors.nitrogen;
  return (
    data.extractors.mineral.find((miner) => miner.mk === request.minerMk) ??
    data.extractors.mineral[data.extractors.mineral.length - 1]!
  );
}

function unmetGroup(itemId: string, itemName: string): ProductionGroup {
  return {
    id: itemId,
    kind: "unmet",
    itemId,
    recipeId: null,
    recipeName: itemName,
    buildingId: "unmet",
    buildingName: "Sem receita",
    machines: [],
    somersloopFilled: 0,
    somersloopSlots: 0,
    variablePower: false,
    powerEstimate: false,
  };
}

function sumIo(machines: MachineUnit[], key: "inputs" | "outputs"): Map<string, number> {
  const totals = new Map<string, number>();
  for (const machine of machines) {
    for (const flow of machine[key]) addMap(totals, flow.itemId, flow.rate);
  }
  return totals;
}

function addMap(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

/** Produção de uma máquina no clock do grupo, sem downclock desse item. */
export function smallestFullClockRate(data: GameData, request: PlanRequest, itemId: string): number {
  const clock = groupClock(request, itemId) / 100;
  const kind = data.resources.find((resource) => resource.id === itemId)?.kind;
  if (kind) {
    const extractor = extractorFor(data, request, kind);
    const purity = extractor.ignoresPurity ? 1 : PURITY[request.purity];
    return roundRate(extractor.baseRate * purity * clock);
  }
  const recipes = data.recipes.filter((recipe) => recipe.outputs.some((output) => output.itemId === itemId));
  const recipe = defaultRecipe(recipes, itemId);
  const primary = recipe?.outputs.find((output) => output.itemId === itemId);
  if (!recipe || !primary || primary.amount <= 0 || recipe.duration <= 0) return 1;
  const building = data.buildings.find((entry) => entry.id === recipe.buildingId);
  const filled = groupSloop(request, itemId, building);
  const amp = amplification(filled, building?.somersloopSlots ?? 0);
  return roundRate((primary.amount / recipe.duration) * 60 * clock * amp);
}

function roundRate(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
