import { GraphState, Entity, Relation } from '../types';

export function mergeGraphData(
  currentGraph: GraphState,
  newNodes: Partial<Entity>[],
  newEdges: Relation[],
  depth: number
): GraphState {
  const nodeMap = new Map(currentGraph.nodes.map(n => [n.id, n]));
  const edgeSet = new Set(currentGraph.edges.map(e => {
    // Handling cases where edge source/target are objects (if d3 modifies them)
    const sourceId = typeof e.source === 'object' ? (e.source as any).id : e.source;
    const targetId = typeof e.target === 'object' ? (e.target as any).id : e.target;
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
    const sourceId = typeof e.source === 'object' ? (e.source as any).id : e.source;
    const targetId = typeof e.target === 'object' ? (e.target as any).id : e.target;
    
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
