"use client";

import Image from "next/image";
import { useMemo, useState, type ReactNode } from "react";
import { gameData, itemName, recipesProducing, resourceIds } from "@/lib/data/load";
import { formatNumber, formatPower, formatRate } from "@/lib/format";
import { expand, smallestFullClockRate } from "@/lib/solver/expand";
import { constructionMaterials } from "@/lib/solver/materials";
import { buildBoard } from "@/lib/solver/topology";
import type { GroupOverride, PlanRequest, PlanTarget } from "@/lib/solver/types";
import { Board } from "./Board";

const inputClass =
  "h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100 outline-none focus:border-amber-400";

const initialRequest: PlanRequest = {
  targets: [],
  globalClock: 100,
  somersloops: false,
  minerMk: 1,
  purity: "pure",
  beltMk: 6,
  pipeMk: 2,
  mode: "manifold",
  overrides: {},
};

export function Planner() {
  const [targets, setTargets] = useState<PlanTarget[]>(() => [
    { itemId: "iron-plate", rate: smallestFullClockRate(gameData, initialRequest, "iron-plate") },
  ]);
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [globalClock, setGlobalClock] = useState(100);
  const [somersloops, setSomersloops] = useState(false);
  const [minerMk, setMinerMk] = useState(1);
  const [purity, setPurity] = useState<PlanRequest["purity"]>("pure");
  const [beltMk, setBeltMk] = useState(6);
  const [pipeMk, setPipeMk] = useState(2);
  const [mode, setMode] = useState<PlanRequest["mode"]>("manifold");
  const [overrides, setOverrides] = useState<Record<string, GroupOverride>>({});
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const items = useMemo(
    () => [...gameData.items].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [],
  );
  const matches = items.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 12);
  const activeTargets = targets.filter((target) => Number.isFinite(target.rate) && target.rate > 0);

  const request = useMemo<PlanRequest>(
    () => ({
      targets: targets.map((target) => ({
        itemId: target.itemId,
        rate: Number.isFinite(target.rate) && target.rate > 0 ? target.rate : 0,
      })),
      globalClock: Number.isFinite(globalClock) ? globalClock : 100,
      somersloops,
      minerMk,
      purity,
      beltMk,
      pipeMk,
      mode,
      overrides,
    }),
    [beltMk, globalClock, minerMk, mode, overrides, pipeMk, purity, somersloops, targets],
  );

  function addTarget(itemId: string) {
    setTargets((current) =>
      current.some((target) => target.itemId === itemId)
        ? current
        : [...current, { itemId, rate: smallestFullClockRate(gameData, request, itemId) }],
    );
    setQuery("");
    setListOpen(false);
  }

  function updateTargetRate(itemId: string, rate: number) {
    setTargets((current) => current.map((target) => (target.itemId === itemId ? { ...target, rate } : target)));
  }

  function removeTarget(itemId: string) {
    setTargets((current) => current.filter((target) => target.itemId !== itemId));
    setSelectedGroupId(null);
  }

  const plan = useMemo(() => expand(gameData, request), [request]);
  const board = useMemo(() => buildBoard(gameData, plan, mode, beltMk, pipeMk), [beltMk, mode, pipeMk, plan]);
  const materials = useMemo(() => constructionMaterials(plan, board), [board, plan]);
  const selected = plan.groups.find((group) => group.id === selectedGroupId) ?? null;
  const recipeOptions = selected ? recipesProducing(selected.itemId) : [];

  function patchOverride(itemId: string, patch: GroupOverride) {
    setOverrides((current) => ({ ...current, [itemId]: { ...current[itemId], ...patch } }));
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">Satisplanner</h1>
          <p className="text-xs text-zinc-400">Máquinas, taxas e a ligação com divisores, mescladores e canos.</p>
        </div>
        <div className="flex rounded-md border border-zinc-700 p-0.5 text-sm">
          <ModeButton active={mode === "manifold"} onClick={() => setMode("manifold")} label="Manifold" />
          <ModeButton active={mode === "balancer"} onClick={() => setMode("balancer")} label="Balanceador" />
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-3 border-b border-zinc-800 px-4 py-3">
        <label className="relative flex flex-col gap-1 text-xs text-zinc-400">
          Adicionar item
          <input
            className={`${inputClass} w-56`}
            value={query}
            onFocus={() => setListOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setListOpen(true);
            }}
            onBlur={() => setTimeout(() => setListOpen(false), 150)}
            placeholder="Buscar item"
          />
          {listOpen ? (
            <ul className="absolute top-full z-20 mt-1 max-h-64 w-56 overflow-auto rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
              {matches.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-zinc-100 hover:bg-zinc-800"
                    onMouseDown={() => addTarget(item.id)}
                  >
                    <Image src={`/icons/${item.id}.webp`} alt="" width={20} height={20} className="size-5 object-contain" />
                    {item.name}
                    <span className="ml-auto text-xs text-zinc-500">{item.form === "fluid" ? "fluido" : "sólido"}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </label>
        <Field label="Clock %">
          <input
            className={`${inputClass} w-24`}
            type="number"
            min={1}
            max={250}
            step="0.0001"
            value={globalClock}
            onChange={(event) => setGlobalClock(Number(event.target.value))}
          />
        </Field>
        <Field label="Mineradora">
          <select className={inputClass} value={minerMk} onChange={(event) => setMinerMk(Number(event.target.value))}>
            {gameData.extractors.mineral.map((miner) => (
              <option key={miner.mk} value={miner.mk}>
                Mk.{miner.mk} ({formatNumber(miner.baseRate * purityFactor(purity), 0)}/min)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pureza">
          <select
            className={inputClass}
            value={purity}
            onChange={(event) => setPurity(event.target.value as PlanRequest["purity"])}
          >
            <option value="impure">Impuro</option>
            <option value="normal">Normal</option>
            <option value="pure">Puro</option>
          </select>
        </Field>
        <Field label="Esteira máx.">
          <select className={inputClass} value={beltMk} onChange={(event) => setBeltMk(Number(event.target.value))}>
            {gameData.belts.map((belt) => (
              <option key={belt.mk} value={belt.mk}>
                Mk.{belt.mk} ({belt.rate}/min)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cano máx.">
          <select className={inputClass} value={pipeMk} onChange={(event) => setPipeMk(Number(event.target.value))}>
            {gameData.pipes.map((pipe) => (
              <option key={pipe.mk} value={pipe.mk}>
                Mk.{pipe.mk} ({pipe.rate} m³/min)
              </option>
            ))}
          </select>
        </Field>
        <label className="flex h-9 items-center gap-2 text-sm text-zinc-200">
          <input type="checkbox" checked={somersloops} onChange={(event) => setSomersloops(event.target.checked)} />
          Somersloops
        </label>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-zinc-800 px-4 py-2">
        {targets.map((target) => {
          const item = gameData.items.find((entry) => entry.id === target.itemId);
          return (
            <div key={target.itemId} className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1">
              <Image src={`/icons/${target.itemId}.webp`} alt="" width={24} height={24} className="size-6 object-contain" />
              <span className="text-sm text-zinc-100">{item?.name ?? target.itemId}</span>
              <input
                className={`${inputClass} w-20`}
                type="number"
                min={0}
                step="0.1"
                aria-label={`Meta de ${item?.name ?? target.itemId}`}
                value={target.rate}
                onChange={(event) => updateTargetRate(target.itemId, Number(event.target.value))}
              />
              <span className="text-xs text-zinc-500">{item?.form === "fluid" ? "m³/min" : "/min"}</span>
              <button
                type="button"
                className="px-1 text-sm text-zinc-400 hover:text-zinc-100"
                aria-label={`Remover ${item?.name ?? target.itemId}`}
                onClick={() => removeTarget(target.itemId)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {plan.warnings.length > 0 ? (
        <div className="border-b border-amber-900 bg-amber-950/60 px-4 py-2 text-sm text-amber-100">
          {plan.warnings.join(" ")}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {activeTargets.length === 0 ? (
            <p className="absolute inset-0 grid place-items-center text-sm text-zinc-400">
              Adicione um item com meta maior que zero.
            </p>
          ) : (
            <Board board={board} onSelectGroup={setSelectedGroupId} />
          )}
        </div>
        <aside className="w-80 shrink-0 overflow-auto border-l border-zinc-800 p-4">
          {selected ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold">{selected.buildingName}</h2>
                <p className="text-sm text-zinc-400">{itemName(selected.itemId)}</p>
              </div>
              <Field label="Receita">
                <select
                  className={`${inputClass} w-full`}
                  value={selected.kind === "extractor" ? "extract" : (selected.recipeId ?? "")}
                  onChange={(event) => patchOverride(selected.itemId, { recipeId: event.target.value })}
                >
                  {resourceIds.has(selected.itemId) ? <option value="extract">Extrair do nó</option> : null}
                  {recipeOptions.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>
                      {recipe.alternate ? `Alt: ${recipe.name.replace(/^Alternate:\s*/, "")}` : recipe.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Clock deste grupo %">
                <input
                  className={`${inputClass} w-full`}
                  type="number"
                  min={1}
                  max={250}
                  step="0.0001"
                  placeholder={`Global (${globalClock})`}
                  value={overrides[selected.itemId]?.clock ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    patchOverride(selected.itemId, { clock: value === "" ? undefined : Number(value) });
                  }}
                />
              </Field>
              {selected.somersloopSlots > 0 ? (
                <Field label="Somersloops">
                  <select
                    className={`${inputClass} w-full`}
                    value={
                      overrides[selected.itemId]?.somersloops === undefined
                        ? "inherit"
                        : overrides[selected.itemId]?.somersloops
                          ? "on"
                          : "off"
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      patchOverride(selected.itemId, {
                        somersloops: value === "inherit" ? undefined : value === "on",
                      });
                    }}
                  >
                    <option value="inherit">Igual ao global</option>
                    <option value="on">Preencher todos os slots</option>
                    <option value="off">Nenhum</option>
                  </select>
                </Field>
              ) : null}
              <p className="text-xs leading-5 text-zinc-400">
                {selected.machines.length} máquina(s). A última fica no clock exato do resto da demanda.
              </p>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-zinc-400">
              <p>Clique numa máquina para trocar a receita, o clock ou os somersloops daquele item.</p>
              <p>
                Taxas iguais ligam direto. Divisor e mesclador só aparecem quando uma saída precisa ser repartida ou várias saídas precisam alimentar a mesma máquina. No balanceador, a árvore só usa divisores de 2 ou 3, e as saídas que sobram recirculam.
              </p>
              <p>Fluidos usam junção de cano nos dois modos, porque o cano não divide por igual.</p>
              <p>Várias metas compartilham as mesmas máquinas. O subproduto de uma meta abate a demanda da seguinte.</p>
            </div>
          )}
        </aside>
      </div>

      {materials.length > 0 ? (
        <section className="border-t border-zinc-800 px-4 py-2">
          <h2 className="text-xs font-medium text-zinc-400">Materiais para construir</h2>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {materials.map((line) => (
              <span key={line.itemId} className="flex items-center gap-1.5 text-xs text-zinc-200">
                <Image src={`/icons/${line.itemId}.webp`} alt="" width={16} height={16} className="size-4 object-contain" />
                {formatNumber(line.amount, 0)} {itemName(line.itemId)}
              </span>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-zinc-500">
            Esteiras e canos contam um trecho por ligação. No jogo o custo sobe cerca de 0,5 peça por metro, arredondado para cima.
          </p>
        </section>
      ) : null}

      <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-800 px-4 py-2 text-xs text-zinc-300">
        {board.totals.machines.map((machine) => (
          <span key={machine.name}>
            {machine.count}× {machine.name}
          </span>
        ))}
        <span>{formatPower(board.totals.power)}{board.totals.powerEstimate ? " (parte estimada)" : ""}{board.totals.variablePower ? " · oscila" : ""}</span>
        <span>{board.totals.shards} shards</span>
        <span>{countLabel(board.totals.splitters, "divisor", "divisores")}</span>
        <span>{countLabel(board.totals.mergers, "mesclador", "mescladores")}</span>
        <span>{countLabel(board.totals.junctions, "junção", "junções")}</span>
        {board.totals.belts.map((belt) => (
          <span key={belt.name}>
            {belt.count}× {belt.name}
          </span>
        ))}
        {board.totals.pipes.map((pipe) => (
          <span key={pipe.name}>
            {pipe.count}× {pipe.name}
          </span>
        ))}
        {board.totals.pressurizers > 0 ? (
          <span>
            {board.totals.pressurizers} pressurizador ({formatNumber(plan.pressurizerPower, 0)} MW)
          </span>
        ) : null}
        {plan.targets.map((target) => (
          <span key={target.itemId}>
            Meta {itemName(target.itemId)} {formatRate(target.rate, gameData.items.find((item) => item.id === target.itemId)?.form ?? "solid")}
          </span>
        ))}
      </footer>
    </div>
  );
}

function purityFactor(purity: PlanRequest["purity"]): number {
  if (purity === "impure") return 0.5;
  if (purity === "pure") return 2;
  return 1;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-400">
      {label}
      {children}
    </label>
  );
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1 ${active ? "bg-amber-500 text-zinc-950" : "text-zinc-300"}`}
    >
      {label}
    </button>
  );
}
