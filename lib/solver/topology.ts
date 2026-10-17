import type { GameData, Item, ItemForm, Transport } from "../data/types";
import { formatNumber, formatRate } from "../format";
import type { Board, BoardEdge, BoardNode, BoardTotals, Plan, PortRef } from "./types";

const EPS = 1e-4;

type Ctx = {
  data: GameData;
  nodes: BoardNode[];
  edges: BoardEdge[];
  seq: number;
  items: Map<string, Item>;
  beltMk: number;
  pipeMk: number;
};

export function buildBoard(
  data: GameData,
  plan: Plan,
  mode: "manifold" | "balancer",
  beltMk: number,
  pipeMk: number,
): Board {
  const ctx: Ctx = {
    data,
    nodes: [],
    edges: [],
    seq: 0,
    items: new Map(data.items.map((item) => [item.id, item])),
    beltMk,
    pipeMk,
  };

  const sources = new Map<string, PortRef[]>();
  const dests = new Map<string, PortRef[]>();

  for (const group of plan.groups) {
    if (group.kind === "unmet") {
      addNode(ctx, {
        kind: "unmet",
        title: group.buildingName,
        subtitle: itemName(ctx, group.itemId),
        lines: ["Não há receita de produção para este item."],
        itemId: group.itemId,
        groupId: group.id,
        width: 264,
        height: 110,
      });
      continue;
    }

    group.machines.forEach((machine, index) => {
      const lines = machineLines(ctx, group.recipeName, group.kind, group.itemId, machine, group);
      const node = addNode(ctx, {
        kind: "machine",
        title: group.buildingName,
        subtitle: `${index + 1}/${group.machines.length}`,
        lines,
        itemId: group.itemId,
        groupId: group.id,
        width: 280,
        height: Math.min(230, 88 + lines.length * 16),
        warning: group.variablePower
          ? group.powerEstimate
            ? "Potência variável, média estimada."
            : "Potência variável: o jogo oscila em torno dessa média."
          : undefined,
      });
      for (const output of machine.outputs) pushPort(sources, output.itemId, { nodeId: node.id, rate: output.rate });
      for (const input of machine.inputs) pushPort(dests, input.itemId, { nodeId: node.id, rate: input.rate });
    });
  }

  for (const target of plan.targets) {
    const targetItem = ctx.items.get(target.itemId);
    const node = addNode(ctx, {
      kind: "target",
      title: "Meta",
      subtitle: targetItem?.name ?? target.itemId,
      lines: [formatRate(target.rate, targetItem?.form ?? "solid")],
      itemId: target.itemId,
      width: 240,
      height: 96,
    });
    pushPort(dests, target.itemId, { nodeId: node.id, rate: target.rate });
  }

  for (const sink of plan.sinks) {
    const item = ctx.items.get(sink.itemId);
    const node = addNode(ctx, {
      kind: "sink",
      title: "Excedente",
      subtitle: item?.name ?? sink.itemId,
      lines: [formatRate(sink.rate, item?.form ?? "solid"), "AWESOME Sink ou reuso"],
      itemId: sink.itemId,
      width: 250,
      height: 110,
    });
    pushPort(dests, sink.itemId, { nodeId: node.id, rate: sink.rate });
  }

  if (plan.pressurizers > 0) {
    const pressurizer = addNode(ctx, {
      kind: "machine",
      title: "Pressurizador",
      subtitle: "Poços",
      lines: [`${formatNumber(plan.pressurizerPower, 0)} MW`, "Um por conjunto de poços de nitrogênio"],
      width: 270,
      height: 110,
    });
    for (const node of ctx.nodes) {
      if (node.groupId !== "nitrogen-gas" || node.kind !== "machine") continue;
      ctx.edges.push({
        id: `e${ctx.seq++}`,
        source: pressurizer.id,
        target: node.id,
        itemId: "nitrogen-gas",
        itemName: "Pressuriza",
        rate: 0,
        form: "fluid",
        mk: 0,
        mkName: "Pressurizador",
        overCapacity: false,
        decorative: true,
      });
    }
  }

  for (const itemId of new Set([...sources.keys(), ...dests.keys()])) {
    const item = ctx.items.get(itemId);
    if (!item) continue;
    let from = sources.get(itemId) ?? [];
    const to = (dests.get(itemId) ?? []).filter((port) => port.rate > EPS);
    if (from.length === 0 && to.length > 0) {
      const unmet = ctx.nodes.find((node) => node.kind === "unmet" && node.itemId === itemId);
      if (unmet) from = [{ nodeId: unmet.id, rate: to.reduce((sum, port) => sum + port.rate, 0) }];
    }
    if (from.length === 0 || to.length === 0) continue;
    if (item.form === "fluid" || mode === "manifold") connectManifold(ctx, from, to, item);
    else connectBalancer(ctx, from, to, item);
  }

  annotatePorts(ctx);

  const logistics = {
    splitters: ctx.nodes.filter((node) => node.kind === "splitter").length,
    mergers: ctx.nodes.filter((node) => node.kind === "merger").length,
    junctions: ctx.nodes.filter((node) => node.kind === "junction").length,
  };

  return { nodes: ctx.nodes, edges: ctx.edges, totals: totals(plan, ctx.edges, logistics) };
}

function machineLines(
  ctx: Ctx,
  recipeName: string | null,
  kind: string,
  itemId: string,
  machine: { clock: number; power: number; shards: number; inputs: { itemId: string; rate: number }[]; outputs: { itemId: string; rate: number }[] },
  group: { somersloopFilled: number; somersloopSlots: number; purity?: "impure" | "normal" | "pure" },
): string[] {
  const lines = [
    kind === "recipe" && recipeName ? recipeName : itemName(ctx, itemId),
    ...machine.outputs.map((output) => `sai ${formatRate(output.rate, formOf(ctx, output.itemId))} ${itemName(ctx, output.itemId)}`),
    ...machine.inputs.map((input) => `entra ${formatRate(input.rate, formOf(ctx, input.itemId))} ${itemName(ctx, input.itemId)}`),
  ];
  const clock = `${machine.clock.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;
  const power = `${machine.power.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MW`;
  lines.push([clock, power, machine.shards > 0 ? `${machine.shards} shards` : ""].filter(Boolean).join(" · "));
  if (group.somersloopFilled > 0) lines.push(`Somersloop ${group.somersloopFilled}/${group.somersloopSlots}`);
  if (group.purity) {
    const label = { impure: "impuro", normal: "normal", pure: "puro" }[group.purity];
    lines.push(`Nó ${label}`);
  }
  return lines;
}

function connectManifold(ctx: Ctx, sources: PortRef[], dests: PortRef[], item: Item) {
  const pendingSources = [...sources];
  const pendingDests = [...dests];
  wireMatchingRates(ctx, pendingSources, pendingDests, item);
  if (pendingSources.length === 0 || pendingDests.length === 0) return;
  routeByDemand(ctx, pendingSources, pendingDests, item);
}

function connectBalancer(ctx: Ctx, sources: PortRef[], dests: PortRef[], item: Item) {
  const pendingSources = [...sources];
  const pendingDests = [...dests];
  wireMatchingRates(ctx, pendingSources, pendingDests, item);
  if (pendingSources.length === 0 || pendingDests.length === 0) return;
  const cap = maxRate(ctx, item.form);
  const trunks = mergeTreeLines(ctx, pendingSources, item, cap);
  const buckets = bucketByRate(pendingDests);
  if (buckets.length === 1) {
    balanceBucket(ctx, trunks, buckets[0]!, item, cap);
    return;
  }
  const holders: { id: string; dests: PortRef[] }[] = [];
  const superDests: PortRef[] = [];
  for (const bucket of buckets) {
    const holder = addNode(ctx, {
      kind: "merger",
      title: "Alimentação",
      lines: [`${bucket.length} máquinas a ${formatRate(bucket[0]!.rate, item.form)}`],
      width: 190,
      height: 78,
    });
    superDests.push({ nodeId: holder.id, rate: sumRates(bucket) });
    holders.push({ id: holder.id, dests: bucket });
  }
  feedLines(ctx, trunks, packInOrder(superDests, cap), item);
  for (const holder of holders) {
    balanceBucket(ctx, [{ nodeId: holder.id, rate: sumRates(holder.dests) }], holder.dests, item, cap);
  }
}

function balanceBucket(ctx: Ctx, feeds: PortRef[], dests: PortRef[], item: Item, cap: number) {
  const remaining = [...dests];
  const supply = [...feeds];
  while (remaining.length > 0) {
    const rate = remaining[0]!.rate;
    const count = largestBalancedGroup(remaining.length, rate, cap);
    const group = remaining.splice(0, count);
    let still = sumRates(group);
    const taken: PortRef[] = [];
    while (still > EPS && supply.length > 0) {
      const trunk = supply[0]!;
      if (trunk.rate <= still + EPS) {
        supply.shift();
        taken.push(trunk);
        still -= trunk.rate;
      } else {
        const peeled = peel(ctx, trunk, still, item);
        taken.push(peeled.taken);
        supply[0] = peeled.rest;
        still = 0;
      }
    }
    if (taken.length === 0) continue;
    const feed = taken.length === 1 ? taken[0]! : mergeUnlimited(ctx, taken, item);
    balanceEqual(ctx, feed, group, item);
  }
}

function balanceEqual(ctx: Ctx, feed: PortRef, dests: PortRef[], item: Item) {
  if (dests.length === 0) return;
  if (dests.length === 1) {
    link(ctx, feed.nodeId, dests[0]!.nodeId, item, dests[0]!.rate);
    return;
  }
  const pad = smallestPad(dests.length);
  const fresh = feed.rate;
  const rootRate = (fresh * pad) / dests.length;
  const recirc = rootRate - fresh;
  let input: PortRef = { nodeId: feed.nodeId, rate: rootRate };
  let mergerId: string | null = null;
  if (recirc > EPS) {
    mergerId = addNode(ctx, {
      kind: "merger",
      title: "Mesclador",
      subtitle: "Recirculação",
      lines: ["Devolve as saídas que sobram"],
      width: 190,
      height: 84,
    }).id;
    link(ctx, feed.nodeId, mergerId, item, fresh);
    input = { nodeId: mergerId, rate: rootRate };
  }
  const leaves = materializeSplit(ctx, input, pad, item);
  for (let index = 0; index < dests.length; index += 1) {
    link(ctx, leaves[index]!.nodeId, dests[index]!.nodeId, item, dests[index]!.rate);
  }
  if (mergerId && pad > dests.length) {
    const extras = leaves.slice(dests.length);
    const back = extras.length === 1 ? extras[0]! : mergeUnlimited(ctx, extras, item);
    link(ctx, back.nodeId, mergerId, item, recirc);
  }
}

function materializeSplit(ctx: Ctx, input: PortRef, size: number, item: Item): PortRef[] {
  if (size <= 1) return [input];
  const ways: 2 | 3 = size % 3 === 0 ? 3 : 2;
  const splitter = addNode(ctx, {
    kind: "splitter",
    title: "Divisor",
    subtitle: `${ways} saídas iguais`,
    lines: [],
    width: 160,
    height: 72,
  });
  link(ctx, input.nodeId, splitter.id, item, input.rate);
  const each = input.rate / ways;
  const leaves: PortRef[] = [];
  for (let index = 0; index < ways; index += 1) {
    leaves.push(...materializeSplit(ctx, { nodeId: splitter.id, rate: each }, size / ways, item));
  }
  return leaves;
}

function mergeTreeLines(ctx: Ctx, ports: PortRef[], item: Item, cap: number): PortRef[] {
  const pool = [...ports];
  const trunks: PortRef[] = [];
  while (pool.length > 0) {
    const group = [pool.shift()!];
    let sum = group[0]!.rate;
    for (let index = 0; index < pool.length; ) {
      const candidate = pool[index]!;
      if (sum + candidate.rate <= cap + EPS) {
        sum += candidate.rate;
        group.push(candidate);
        pool.splice(index, 1);
      } else index += 1;
    }
    trunks.push(mergeUnlimited(ctx, group, item));
  }
  return trunks;
}

function wireMatchingRates(ctx: Ctx, sources: PortRef[], dests: PortRef[], item: Item) {
  for (let destIndex = 0; destIndex < dests.length; ) {
    const dest = dests[destIndex]!;
    const sourceIndex = sources.findIndex((source) => Math.abs(source.rate - dest.rate) <= EPS);
    if (sourceIndex < 0) {
      destIndex += 1;
      continue;
    }
    const source = sources.splice(sourceIndex, 1)[0]!;
    link(ctx, source.nodeId, dest.nodeId, item, dest.rate);
    dests.splice(destIndex, 1);
  }
}

function routeByDemand(ctx: Ctx, sources: PortRef[], dests: PortRef[], item: Item) {
  const supply = [...sources];
  for (const dest of dests) {
    let need = dest.rate;
    const incoming: PortRef[] = [];
    while (need > EPS && supply.length > 0) {
      const fitIndex = largestThatFits(supply, need);
      if (fitIndex >= 0) {
        const source = supply.splice(fitIndex, 1)[0]!;
        incoming.push(source);
        need -= source.rate;
        continue;
      }
      const splitIndex = smallestIndex(supply);
      const peeled = peel(ctx, supply[splitIndex]!, need, item);
      supply[splitIndex] = peeled.rest;
      incoming.push(peeled.taken);
      need = 0;
    }
    if (incoming.length === 0) continue;
    const feed = incoming.length === 1 ? incoming[0]! : mergeUnlimited(ctx, incoming, item);
    link(ctx, feed.nodeId, dest.nodeId, item, Math.min(dest.rate, feed.rate));
  }
}

function largestThatFits(ports: PortRef[], need: number): number {
  let best = -1;
  for (let index = 0; index < ports.length; index += 1) {
    if (ports[index]!.rate > need + EPS) continue;
    if (best < 0 || ports[index]!.rate > ports[best]!.rate) best = index;
  }
  return best;
}

function smallestIndex(ports: PortRef[]): number {
  let best = 0;
  for (let index = 1; index < ports.length; index += 1) {
    if (ports[index]!.rate < ports[best]!.rate) best = index;
  }
  return best;
}

function mergeChain(ctx: Ctx, ports: PortRef[], item: Item): PortRef {
  if (ports.length === 1) return ports[0]!;
  let running = ports[0]!;
  for (let index = 1; index < ports.length; index += 1) {
    const next = ports[index]!;
    const merger = logistics(ctx, item.form, "merger");
    link(ctx, running.nodeId, merger.id, item, running.rate);
    link(ctx, next.nodeId, merger.id, item, next.rate);
    running = { nodeId: merger.id, rate: running.rate + next.rate };
  }
  return running;
}

function mergeUnlimited(ctx: Ctx, ports: PortRef[], item: Item): PortRef {
  if (ports.length === 1) return ports[0]!;
  const ways = Math.min(3, ports.length);
  const slice = ports.slice(0, ways);
  const rest = ports.slice(ways);
  const merger = logistics(ctx, item.form, "merger");
  let sum = 0;
  for (const port of slice) {
    link(ctx, port.nodeId, merger.id, item, port.rate);
    sum += port.rate;
  }
  return mergeUnlimited(ctx, [{ nodeId: merger.id, rate: sum }, ...rest], item);
}

function feedLines(ctx: Ctx, trunks: PortRef[], lines: PortRef[][], item: Item) {
  const supply = [...trunks];
  for (const line of lines) {
    let still = sumRates(line);
    const taken: PortRef[] = [];
    while (still > EPS && supply.length > 0) {
      const trunk = supply[0]!;
      if (trunk.rate <= still + EPS) {
        supply.shift();
        taken.push(trunk);
        still -= trunk.rate;
      } else {
        const peeled = peel(ctx, trunk, still, item);
        taken.push(peeled.taken);
        supply[0] = peeled.rest;
        still = 0;
      }
    }
    if (taken.length === 0) continue;
    const feed = taken.length === 1 ? taken[0]! : mergeChain(ctx, taken, item);
    splitLine(ctx, feed, line, item);
  }
}

function splitLine(ctx: Ctx, feed: PortRef, dests: PortRef[], item: Item) {
  let runningId = feed.nodeId;
  let runningRate = feed.rate;
  for (let index = 0; index < dests.length; index += 1) {
    const dest = dests[index]!;
    if (index === dests.length - 1) {
      link(ctx, runningId, dest.nodeId, item, dest.rate);
      return;
    }
    const splitter = logistics(ctx, item.form, "splitter");
    link(ctx, runningId, splitter.id, item, runningRate);
    link(ctx, splitter.id, dest.nodeId, item, dest.rate);
    runningRate -= dest.rate;
    runningId = splitter.id;
  }
}

function peel(ctx: Ctx, trunk: PortRef, take: number, item: Item): { taken: PortRef; rest: PortRef } {
  const splitter = logistics(ctx, item.form, "splitter");
  link(ctx, trunk.nodeId, splitter.id, item, trunk.rate);
  return {
    taken: { nodeId: splitter.id, rate: take },
    rest: { nodeId: splitter.id, rate: trunk.rate - take },
  };
}

function annotatePorts(ctx: Ctx) {
  for (const node of ctx.nodes) {
    const touched = ctx.edges.filter((edge) => edge.source === node.id || edge.target === node.id);
    if (!node.itemId) {
      const carrier = touched.find((edge) => !edge.decorative) ?? touched[0];
      if (carrier) node.itemId = carrier.itemId;
    }
    if (node.kind !== "splitter" && node.kind !== "merger" && node.kind !== "junction") continue;
    const incoming = touched.filter((edge) => edge.target === node.id && !edge.decorative);
    const outgoing = touched.filter((edge) => edge.source === node.id && !edge.decorative);
    const rates = [
      ...incoming.map((edge) => `entra ${formatRate(edge.rate, edge.form)}`),
      ...outgoing.map((edge) => `sai ${formatRate(edge.rate, edge.form)}`),
    ];
    if (rates.length === 0) continue;
    const hint = node.lines.filter((line) => !line.startsWith("entra ") && !line.startsWith("sai "));
    node.lines = [...hint, ...rates];
    const warningSpace = node.warning ? 36 : 0;
    node.height = Math.max(88, 56 + node.lines.length * 16 + warningSpace);
    node.width = Math.max(node.width + 44, 244);
  }
}

function logistics(ctx: Ctx, form: ItemForm, role: "splitter" | "merger"): BoardNode {
  if (form === "fluid") {
    return addNode(ctx, {
      kind: "junction",
      title: "Junção de cano",
      lines: [],
      warning: "O cano não divide por igual. Alimente o manifold pelas duas pontas.",
      width: 210,
      height: 96,
    });
  }
  if (role === "splitter") {
    return addNode(ctx, {
      kind: "splitter",
      title: "Divisor",
      subtitle: "Manifold",
      lines: ["A máquina puxa a taxa dela"],
      width: 180,
      height: 84,
    });
  }
  return addNode(ctx, {
    kind: "merger",
    title: "Mesclador",
    lines: [],
    width: 150,
    height: 64,
  });
}

function link(ctx: Ctx, source: string, target: string, item: Item, rate: number) {
  if (rate <= EPS) return;
  const table = item.form === "fluid" ? ctx.data.pipes : ctx.data.belts;
  const maxMk = item.form === "fluid" ? ctx.pipeMk : ctx.beltMk;
  const choice = chooseTransport(table, maxMk, rate);
  ctx.edges.push({
    id: `e${ctx.seq++}`,
    source,
    target,
    itemId: item.id,
    itemName: item.name,
    rate,
    form: item.form,
    mk: choice.mk,
    mkName: choice.name,
    overCapacity: choice.over,
  });
}

function chooseTransport(table: Transport[], maxMk: number, rate: number): Transport & { over: boolean } {
  const allowed = table.filter((entry) => entry.mk <= maxMk);
  const fit = allowed.find((entry) => entry.rate + EPS >= rate);
  if (fit) return { ...fit, over: false };
  const last = allowed[allowed.length - 1] ?? table[0]!;
  return { ...last, over: true };
}

function maxRate(ctx: Ctx, form: ItemForm): number {
  const table = form === "fluid" ? ctx.data.pipes : ctx.data.belts;
  const maxMk = form === "fluid" ? ctx.pipeMk : ctx.beltMk;
  const allowed = table.filter((entry) => entry.mk <= maxMk);
  return allowed[allowed.length - 1]?.rate ?? table[0]!.rate;
}

function addNode(ctx: Ctx, node: Omit<BoardNode, "id">): BoardNode {
  const created: BoardNode = { ...node, id: `n${ctx.seq++}` };
  ctx.nodes.push(created);
  return created;
}

function pushPort(map: Map<string, PortRef[]>, itemId: string, port: PortRef) {
  const list = map.get(itemId) ?? [];
  list.push(port);
  map.set(itemId, list);
}

function packInOrder(ports: PortRef[], cap: number): PortRef[][] {
  const lines: PortRef[][] = [];
  let current: PortRef[] = [];
  let sum = 0;
  for (const port of ports) {
    if (current.length > 0 && sum + port.rate > cap + EPS) {
      lines.push(current);
      current = [];
      sum = 0;
    }
    current.push(port);
    sum += port.rate;
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function bucketByRate(ports: PortRef[]): PortRef[][] {
  const buckets: PortRef[][] = [];
  for (const port of ports) {
    const found = buckets.find((bucket) => Math.abs(bucket[0]!.rate - port.rate) < 0.001);
    if (found) found.push(port);
    else buckets.push([port]);
  }
  return buckets;
}

function largestBalancedGroup(count: number, rate: number, cap: number): number {
  let best = 1;
  for (let size = 1; size <= count; size += 1) {
    const pad = smallestPad(size);
    if (rate * pad <= cap + EPS && rate * size <= cap + EPS) best = size;
  }
  return best;
}

function smallestPad(count: number): number {
  let best = 2 ** 12;
  for (let twos = 0; twos <= 12; twos += 1) {
    for (let threes = 0; threes <= 8; threes += 1) {
      const value = 2 ** twos * 3 ** threes;
      if (value >= count && value < best) best = value;
    }
  }
  return best;
}

function sumRates(ports: PortRef[]): number {
  return ports.reduce((total, port) => total + port.rate, 0);
}

function formOf(ctx: Ctx, itemId: string): ItemForm {
  return ctx.items.get(itemId)?.form ?? "solid";
}

function itemName(ctx: Ctx, itemId: string): string {
  return ctx.items.get(itemId)?.name ?? itemId;
}

function totals(
  plan: Plan,
  edges: BoardEdge[],
  logistics: { splitters: number; mergers: number; junctions: number },
): BoardTotals {
  const machineCounts = new Map<string, number>();
  let power = plan.pressurizerPower;
  let shards = 0;
  let variablePower = false;
  let powerEstimate = false;
  for (const group of plan.groups) {
    if (group.machines.length === 0) continue;
    machineCounts.set(group.buildingName, (machineCounts.get(group.buildingName) ?? 0) + group.machines.length);
    for (const machine of group.machines) {
      power += machine.power;
      shards += machine.shards;
    }
    variablePower = variablePower || group.variablePower;
    powerEstimate = powerEstimate || group.powerEstimate;
  }
  const belts = new Map<number, { mk: number; name: string; count: number }>();
  const pipes = new Map<number, { mk: number; name: string; count: number }>();
  for (const edge of edges) {
    if (edge.decorative) continue;
    const bucket = edge.form === "fluid" ? pipes : belts;
    const current = bucket.get(edge.mk) ?? { mk: edge.mk, name: edge.mkName, count: 0 };
    current.count += 1;
    bucket.set(edge.mk, current);
  }
  return {
    machines: [...machineCounts.entries()].map(([name, count]) => ({ name, count })),
    power,
    shards,
    ...logistics,
    belts: [...belts.values()].sort((a, b) => a.mk - b.mk),
    pipes: [...pipes.values()].sort((a, b) => a.mk - b.mk),
    variablePower,
    powerEstimate,
    pressurizers: plan.pressurizers,
  };
}
