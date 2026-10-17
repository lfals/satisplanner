"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import Image from "next/image";
import { useState } from "react";
import { itemName } from "@/lib/data/load";
import type { BoardNode } from "@/lib/solver/types";

export type FlowNode = Node<BoardNode, "card">;

const tone: Record<BoardNode["kind"], string> = {
  machine: "border-amber-500/80 bg-zinc-900",
  splitter: "border-sky-400/80 bg-sky-950",
  merger: "border-emerald-400/80 bg-emerald-950",
  junction: "border-cyan-300/80 bg-cyan-950",
  target: "border-amber-300 bg-amber-950",
  sink: "border-rose-400/80 bg-rose-950",
  unmet: "border-red-500 bg-red-950",
};

function ItemIcon({ itemId }: { itemId: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <Image
      src={`/icons/${itemId}.webp`}
      alt={itemName(itemId)}
      width={40}
      height={40}
      className="size-10 shrink-0 rounded bg-black/40 object-contain"
      onError={() => setHidden(true)}
    />
  );
}

export function CardNode({ data, selected }: NodeProps<FlowNode>) {
  return (
    <div
      role={data.kind === "machine" ? "button" : undefined}
      className={`flex h-full w-full gap-2 overflow-hidden rounded-md border px-2.5 py-2 text-left shadow-lg ${tone[data.kind]} ${selected ? "ring-2 ring-amber-300" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-200" />
      {data.itemId ? <ItemIcon itemId={data.itemId} /> : null}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-zinc-400">{data.subtitle}</div>
        <div className="text-sm font-semibold text-zinc-50">{data.title}</div>
        <div className="mt-1 space-y-0.5 text-[11px] leading-4 text-zinc-300">
          {data.lines.map((line, index) => (
            <div key={`${line}-${index}`}>{line}</div>
          ))}
        </div>
        {data.warning ? <div className="mt-1 text-[11px] leading-4 text-amber-200">{data.warning}</div> : null}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-zinc-200" />
    </div>
  );
}
