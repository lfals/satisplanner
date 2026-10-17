"use client";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useState } from "react";
import { formatRate } from "@/lib/format";
import type { Board, BoardNode } from "@/lib/solver/types";
import { CardNode, type FlowNode } from "./nodes";

const nodeTypes = { card: CardNode };

const palette = ["#f5a623", "#7eb6ff", "#3dcc8a", "#ff7b72", "#d2a8ff", "#56d4e0", "#ffd580", "#ff9ecf"];

function colorFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length] ?? "#f5a623";
}

function assignDepth(board: Board): Map<string, number> {
  const parents = new Map<string, string[]>();
  for (const edge of board.edges) {
    if (edge.decorative) continue;
    const list = parents.get(edge.target) ?? [];
    list.push(edge.source);
    parents.set(edge.target, list);
  }
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  function walk(id: string): number {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const incoming = parents.get(id) ?? [];
    const value = incoming.length === 0 ? 0 : Math.max(...incoming.map(walk)) + 1;
    visiting.delete(id);
    depth.set(id, value);
    return value;
  }
  for (const node of board.nodes) walk(node.id);
  return depth;
}

async function layoutBoard(board: Board): Promise<{ nodes: FlowNode[]; edges: Edge[] }> {
  const ELK = (await import("elkjs/lib/elk.bundled.js")).default;
  const elk = new ELK();
  const depth = assignDepth(board);
  const graph = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.partitioning.activate": "true",
      "elk.spacing.nodeNode": "28",
      "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      "elk.layered.spacing.edgeNodeBetweenLayers": "24",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: board.nodes.map((node) => ({
      id: node.id,
      width: node.width,
      height: node.height,
      layoutOptions: { "elk.partitioning.partition": String(depth.get(node.id) ?? 0) },
    })),
    edges: board.edges.map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  });
  const positions = new Map((graph.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]));
  return {
    nodes: board.nodes.map((node) => toFlowNode(node, positions.get(node.id) ?? { x: 0, y: 0 })),
    edges: board.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edgeLabel(edge),
      type: "smoothstep",
      style: {
        stroke: edge.overCapacity ? "#f87171" : edge.decorative ? "#a1a1aa" : colorFor(edge.itemId),
        strokeWidth: 2,
        strokeDasharray: edge.decorative ? "6 4" : undefined,
      },
      labelStyle: { fill: "#e4e4e7", fontSize: 11 },
      labelBgStyle: { fill: "#18181b", fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
    })),
  };
}

function edgeLabel(edge: Board["edges"][number]): string {
  if (edge.decorative) return edge.mkName;
  const transport = edge.form === "fluid" ? `Cano Mk.${edge.mk}` : `Mk.${edge.mk}`;
  const capacity = edge.overCapacity ? " · acima da capacidade" : "";
  return `${edge.itemName} · ${formatRate(edge.rate, edge.form)} · ${transport}${capacity}`;
}

function toFlowNode(node: BoardNode, position: { x: number; y: number }): FlowNode {
  return {
    id: node.id,
    type: "card",
    position,
    data: node,
    style: { width: node.width, height: node.height },
    draggable: true,
  };
}

export function Board({
  board,
  onSelectGroup,
}: {
  board: Board;
  onSelectGroup: (groupId: string | null) => void;
}) {
  return (
    <ReactFlowProvider>
      <BoardCanvas board={board} onSelectGroup={onSelectGroup} />
    </ReactFlowProvider>
  );
}

function BoardCanvas({
  board,
  onSelectGroup,
}: {
  board: Board;
  onSelectGroup: (groupId: string | null) => void;
}) {
  const { setViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [appliedBoard, setAppliedBoard] = useState<Board | null>(null);

  useEffect(() => {
    let cancel = false;
    layoutBoard(board).then((laidOut) => {
      if (cancel) return;
      setNodes(laidOut.nodes);
      setEdges(laidOut.edges);
        setAppliedBoard(board);
        if (laidOut.nodes.length > 0) {
          const zoom = 0.85;
          const minX = Math.min(...laidOut.nodes.map((node) => node.position.x));
          const minY = Math.min(...laidOut.nodes.map((node) => node.position.y));
          window.setTimeout(() => {
            if (!cancel) setViewport({ x: 28 - minX * zoom, y: 28 - minY * zoom, zoom });
          }, 40);
        }
    });
    return () => {
      cancel = true;
    };
  }, [board, setEdges, setNodes, setViewport]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => onSelectGroup(node.data.groupId ?? null)}
      onPaneClick={() => onSelectGroup(null)}
      colorMode="dark"
      fitViewOptions={{ padding: 0.12, minZoom: 0.08, maxZoom: 1.25 }}
      minZoom={0.08}
      maxZoom={1.5}
      onlyRenderVisibleElements
      proOptions={{ hideAttribution: false }}
      nodesConnectable={false}
    >
      <Background color="#3f3f46" gap={20} />
      <Controls />
      <MiniMap pannable zoomable className="!bg-zinc-900" />
      {appliedBoard !== board ? (
        <div className="pointer-events-none absolute top-3 left-3 z-10 rounded bg-zinc-900/90 px-2 py-1 text-xs text-zinc-300">
          Organizando o quadro…
        </div>
      ) : null}
    </ReactFlow>
  );
}
