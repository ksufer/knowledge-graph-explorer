import { GraphState, Entity, Relation } from '../types';

export function getEdgeEndpointId(ref: string | { id: string }): string {
  return typeof ref === 'string' ? ref : ref.id;
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '_');
}

export function mergeGraphData(
  currentGraph: GraphState,
  newNodes: Partial<Entity>[],
  newEdges: Relation[],
  depth: number
): GraphState {
  const nodeMap = new Map(currentGraph.nodes.map(n => [n.id, n]));
  const edgeSet = new Set(currentGraph.edges.map(e => {
    const sourceId = getEdgeEndpointId(e.source);
    const targetId = getEdgeEndpointId(e.target);
    return `${sourceId}-${targetId}-${e.relation}`;
  }));

  for (const n of newNodes) {
    if (!nodeMap.has(n.id!)) {
      nodeMap.set(n.id!, {
        id: n.id!,
        name: n.name!,
        type: (n.type as any) || 'other',
        description: n.description || '',
        depth,
        expanded: false
      });
    }
  }

  const updatedEdges = [...currentGraph.edges];
  for (const e of newEdges) {
    const sourceId = getEdgeEndpointId(e.source);
    const targetId = getEdgeEndpointId(e.target);

    // Make sure nodes exist
    if (nodeMap.has(sourceId) && nodeMap.has(targetId)) {
        const key = `${sourceId}-${targetId}-${e.relation}`;
        if (!edgeSet.has(key)) {
            edgeSet.add(key);
            updatedEdges.push({ source: sourceId, target: targetId, relation: e.relation });
        }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: updatedEdges,
  };
}
