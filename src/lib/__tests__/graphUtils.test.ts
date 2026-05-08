import { describe, it, expect } from 'vitest';
import { getEdgeEndpointId, slugify, mergeGraphData } from '../graphUtils';
import { GraphState } from '../../types';

describe('getEdgeEndpointId', () => {
  it('returns string input directly', () => {
    expect(getEdgeEndpointId('node_1')).toBe('node_1');
  });

  it('extracts id from object', () => {
    expect(getEdgeEndpointId({ id: 'node_2' })).toBe('node_2');
  });
});

describe('slugify', () => {
  it('converts spaces to underscores and lowercases', () => {
    expect(slugify('Hello World')).toBe('hello_world');
  });

  it('handles already-lowercased text', () => {
    expect(slugify('transformer')).toBe('transformer');
  });

  it('handles Chinese characters', () => {
    expect(slugify('深度学习 模型')).toBe('深度学习_模型');
  });
});

describe('mergeGraphData', () => {
  const base: GraphState = {
    nodes: [{ id: 'a', name: 'A', type: 'concept', description: 'desc', depth: 0, expanded: false }],
    edges: [{ source: 'a', target: 'b', relation: 'leads_to' }],
  };

  it('adds new nodes', () => {
    const result = mergeGraphData(base, [{ id: 'b', name: 'B', type: 'concept', description: '' }], [], 1);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.find(n => n.id === 'b')!.depth).toBe(1);
  });

  it('skips duplicate nodes by id', () => {
    const result = mergeGraphData(base, [{ id: 'a', name: 'Duplicate A' }], [], 1);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].name).toBe('A');
  });

  it('adds new edges', () => {
    const result = mergeGraphData(
      { nodes: base.nodes, edges: [] },
      [{ id: 'b', name: 'B' }],
      [{ source: 'a', target: 'b', relation: 'contains' }],
      1
    );
    expect(result.edges).toHaveLength(1);
  });

  it('skips duplicate edges by source-target-relation key', () => {
    const result = mergeGraphData(
      { nodes: base.nodes, edges: base.edges },
      [],
      [{ source: 'a', target: 'b', relation: 'leads_to' }],
      1
    );
    expect(result.edges).toHaveLength(1);
  });

  it('drops edges where endpoint nodes do not exist', () => {
    const result = mergeGraphData(
      { nodes: base.nodes, edges: [] },
      [],
      [{ source: 'a', target: 'missing', relation: 'connects_to' }],
      1
    );
    expect(result.edges).toHaveLength(0);
  });
});
