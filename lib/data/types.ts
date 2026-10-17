export type ItemForm = "solid" | "fluid";

export type ResourceKind = "mineral" | "oil" | "water" | "nitrogen";

export type Item = {
  id: string;
  name: string;
  form: ItemForm;
};

export type Resource = {
  id: string;
  kind: ResourceKind;
};

export type Io = {
  itemId: string;
  amount: number;
};

export type Recipe = {
  id: string;
  name: string;
  alternate: boolean;
  buildingId: string;
  duration: number;
  inputs: Io[];
  outputs: Io[];
};

export type Building = {
  id: string;
  name: string;
  power: number;
  somersloopSlots: number;
  variablePower: boolean;
  powerEstimate: boolean;
  powerRange: [number, number] | null;
};

export type Extractor = {
  id: string;
  name: string;
  baseRate: number;
  power: number;
  mk?: number;
  ignoresPurity?: boolean;
};

export type Transport = {
  mk: number;
  name: string;
  rate: number;
};

export type GameData = {
  source: string;
  gameVersion: string;
  belts: Transport[];
  pipes: Transport[];
  buildings: Building[];
  extractors: {
    mineral: Extractor[];
    oil: Extractor;
    water: Extractor;
    nitrogen: Extractor & {
      pressurizer: { id: string; name: string; power: number };
    };
  };
  resources: Resource[];
  items: Item[];
  recipes: Recipe[];
};
