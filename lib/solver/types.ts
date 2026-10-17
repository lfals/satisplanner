import type { ItemForm } from "../data/types";

export type PlanTarget = {
  itemId: string;
  rate: number;
};

export type PlanRequest = {
  targets: PlanTarget[];
  globalClock: number;
  somersloops: boolean;
  minerMk: number;
  purity: "impure" | "normal" | "pure";
  beltMk: number;
  pipeMk: number;
  mode: "manifold" | "balancer";
  overrides: Record<string, GroupOverride>;
};

export type GroupOverride = {
  recipeId?: string;
  clock?: number;
  somersloops?: boolean;
};

export type FlowRate = {
  itemId: string;
  rate: number;
};

export type MachineUnit = {
  index: number;
  clock: number;
  power: number;
  shards: number;
  inputs: FlowRate[];
  outputs: FlowRate[];
};

export type GroupKind = "recipe" | "extractor" | "unmet";

export type ProductionGroup = {
  id: string;
  kind: GroupKind;
  itemId: string;
  recipeId: string | null;
  recipeName: string | null;
  buildingId: string;
  buildingName: string;
  machines: MachineUnit[];
  somersloopFilled: number;
  somersloopSlots: number;
  variablePower: boolean;
  powerEstimate: boolean;
  extractorKind?: "mineral" | "oil" | "water" | "nitrogen";
  purity?: "impure" | "normal" | "pure";
  minerMk?: number;
};

export type Plan = {
  targets: PlanTarget[];
  groups: ProductionGroup[];
  sinks: FlowRate[];
  warnings: string[];
  pressurizers: number;
  pressurizerPower: number;
};

export type PortRef = {
  nodeId: string;
  rate: number;
};

export type NodeKind = "machine" | "splitter" | "merger" | "junction" | "target" | "sink" | "unmet";

export type BoardNode = {
  id: string;
  kind: NodeKind;
  title: string;
  subtitle?: string;
  lines: string[];
  warning?: string;
  itemId?: string;
  groupId?: string;
  width: number;
  height: number;
};

export type BoardEdge = {
  id: string;
  source: string;
  target: string;
  itemId: string;
  itemName: string;
  rate: number;
  form: ItemForm;
  mk: number;
  mkName: string;
  overCapacity: boolean;
  decorative?: boolean;
};

export type TransportCount = {
  mk: number;
  name: string;
  count: number;
};

export type BoardTotals = {
  machines: { name: string; count: number }[];
  power: number;
  shards: number;
  splitters: number;
  mergers: number;
  junctions: number;
  belts: TransportCount[];
  pipes: TransportCount[];
  variablePower: boolean;
  powerEstimate: boolean;
  pressurizers: number;
};

export type Board = {
  nodes: BoardNode[];
  edges: BoardEdge[];
  totals: BoardTotals;
};
