import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { GraphState, Entity } from '../types/index';
import { getEdgeEndpointId } from '../lib/graphUtils';

// Force simulation tuning
const LINK_DISTANCE = 120;
const CHARGE_STRENGTH = -400;
const NEW_NODE_SEED_OFFSET = 80;
const ZOOM_LABEL_HIDE = 0.6;
const ZOOM_LABEL_DEGREE_THRESHOLD = 1.0;
const LABEL_DEGREE_MIN = 3;

interface KnowledgeGraphProps {
  data: GraphState;
  selectedEntityId: string | null;
  onNodeClick: (entity: Entity) => void;
}

function nodeRadius(degree: number): number {
  return Math.min(4 + degree * 2.5, 30);
}

function truncateName(name: string): string {
  return name.length > 10 ? name.slice(0, 9) + '…' : name;
}

function getLabelOpacity(scale: number, degree: number): number {
  if (scale < ZOOM_LABEL_HIDE) return 0;
  if (scale < ZOOM_LABEL_DEGREE_THRESHOLD) return degree >= LABEL_DEGREE_MIN ? 1 : 0;
  return 1;
}

export default function KnowledgeGraph({ data, selectedEntityId, onNodeClick }: KnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<d3.SimulationNodeDatum, undefined> | null>(null);
  const positionsRef = useRef<Map<string, {x: number, y: number}>>(new Map());

  useEffect(() => {
    if (!containerRef.current || !svgRef.current || data.nodes.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const rootGroup = svg.append('g');

    // Track zoom scale for semantic zooming
    let currentScale = 1;
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        currentScale = event.transform.k;
        rootGroup.attr('transform', event.transform);

        rootGroup.selectAll<SVGTextElement, Entity>('.node-label')
          .style('opacity', d => getLabelOpacity(currentScale, degrees[d.id] || 0));
      });

    svg.call(zoom);

    const prevPositions = positionsRef.current;

    const nodes = data.nodes.map(d => {
      const n = { ...d } as (Entity & d3.SimulationNodeDatum);
      const prev = prevPositions.get(d.id);
      if (prev) {
        n.x = prev.x;
        n.y = prev.y;
      }
      return n;
    });
    const links = data.edges.map(d => ({ ...d })) as any[];

    // Seed new nodes near their parent
    for (const link of links) {
      const sourceId = getEdgeEndpointId(link.source);
      const targetId = getEdgeEndpointId(link.target);
      const sourceNode = nodes.find(n => n.id === sourceId);
      const targetNode = nodes.find(n => n.id === targetId);
      if (sourceNode && targetNode && sourceNode.x != null && targetNode.x == null) {
        targetNode.x = sourceNode.x! + (Math.random() - 0.5) * NEW_NODE_SEED_OFFSET;
        targetNode.y = sourceNode.y! + (Math.random() - 0.5) * NEW_NODE_SEED_OFFSET;
      }
    }

    // Calculate degree for each node
    const degrees: Record<string, number> = {};
    nodes.forEach(n => degrees[n.id] = 0);
    links.forEach(l => {
      degrees[l.source] = (degrees[l.source] || 0) + 1;
      degrees[l.target] = (degrees[l.target] || 0) + 1;
    });

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(LINK_DISTANCE))
      .force('charge', d3.forceManyBody().strength(CHARGE_STRENGTH))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(d => nodeRadius(degrees[(d as any).id] || 0) + 3));

    simulationRef.current = simulation;

    const linkGroup = rootGroup.append('g').attr('class', 'links');
    const nodeGroup = rootGroup.append('g').attr('class', 'nodes');

    const link = linkGroup.selectAll('.link')
      .data(links)
      .enter().append('line')
      .attr('class', 'link')
      .attr('stroke', '#d0d0d0')
      .attr('stroke-width', 1);

    // Render nodes
    const node = nodeGroup.selectAll('.node')
      .data(nodes)
      .enter().append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(d3.drag<SVGGElement, any>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        onNodeClick(d as Entity);
      });

    node.append('circle')
      .attr('class', 'node-circle')
      .attr('r', d => nodeRadius(degrees[d.id] || 0))
      .attr('fill', d => d.id === selectedEntityId ? '#333333' : '#666666')
      .style('opacity', 0)
      .transition()
      .duration(600)
      .style('opacity', 1);

    // Expanded ring
    node.filter(d => d.expanded).append('circle')
      .attr('r', d => nodeRadius(degrees[d.id] || 0) + 4)
      .attr('fill', 'none')
      .attr('stroke', '#999999')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3,3');

    node.append('text')
      .attr('class', 'node-label')
      .attr('text-anchor', 'start')
      .attr('dx', d => nodeRadius(degrees[d.id] || 0) + 6)
      .attr('dy', 4)
      .style('font-family', 'Inter, Roboto, system-ui, sans-serif')
      .style('font-size', '11px')
      .style('fill', '#333333')
      .text(d => truncateName(d.name));

    node.append('title').text(d => `${d.name}\n${d.description || ''}`);

    // --- Hover highlighting ---
    node.on('mouseenter', function(event, d) {
      const hoveredId = d.id;
      const neighborIds = new Set<string>();
      neighborIds.add(hoveredId);

      links.forEach(l => {
        const sid = getEdgeEndpointId(l.source);
        const tid = getEdgeEndpointId(l.target);
        if (sid === hoveredId) neighborIds.add(tid);
        if (tid === hoveredId) neighborIds.add(sid);
      });

      // Dim all nodes not in the local network
      node.select<SVGCircleElement>('.node-circle')
        .transition().duration(200)
        .attr('fill', n => neighborIds.has(n.id) ? '#333333' : '#cccccc')
        .style('opacity', n => neighborIds.has(n.id) ? 1 : 0.15);

      node.select<SVGTextElement>('.node-label')
        .transition().duration(200)
        .style('opacity', n => neighborIds.has(n.id) ? 1 : 0.05);

      link.transition().duration(200)
        .attr('stroke', l => {
          const sid = getEdgeEndpointId(l.source);
          const tid = getEdgeEndpointId(l.target);
          return (sid === hoveredId || tid === hoveredId) ? '#333333' : '#e8e8e8';
        })
        .attr('stroke-width', l => {
          const sid = getEdgeEndpointId(l.source);
          const tid = getEdgeEndpointId(l.target);
          return (sid === hoveredId || tid === hoveredId) ? 1.5 : 0.5;
        })
        .style('opacity', l => {
          const sid = getEdgeEndpointId(l.source);
          const tid = getEdgeEndpointId(l.target);
          return (sid === hoveredId || tid === hoveredId) ? 1 : 0.08;
        });
    });

    node.on('mouseleave', function() {
      node.select<SVGCircleElement>('.node-circle')
        .transition().duration(300)
        .attr('fill', n => n.id === selectedEntityId ? '#333333' : '#666666')
        .style('opacity', 1);

      node.select<SVGTextElement>('.node-label')
        .transition().duration(300)
        .style('opacity', n => getLabelOpacity(currentScale, degrees[n.id] || 0));

      link.transition().duration(300)
        .attr('stroke', '#d0d0d0')
        .attr('stroke-width', 1)
        .style('opacity', 1);
    });

    simulation.on('tick', () => {
      link.each(function(d) {
        const dx = d.target.x - d.source.x;
        const dy = d.target.y - d.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const sourceR = nodeRadius(degrees[getEdgeEndpointId(d.source)] || 0);
        const targetR = nodeRadius(degrees[getEdgeEndpointId(d.target)] || 0);
        d3.select(this)
          .attr('x1', d.source.x + (dx / dist) * sourceR)
          .attr('y1', d.source.y + (dy / dist) * sourceR)
          .attr('x2', d.target.x - (dx / dist) * targetR)
          .attr('y2', d.target.y - (dy / dist) * targetR);
      });

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Save positions on cooldown
    simulation.on('end', () => {
      const newPositions = new Map<string, {x: number, y: number}>();
      nodes.forEach(n => {
        if (n.x != null && n.y != null) {
          newPositions.set(n.id, { x: n.x, y: n.y });
        }
      });
      positionsRef.current = newPositions;
    });

    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [data, onNodeClick, selectedEntityId]);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#f8f9fa] relative overflow-hidden">
      {/* Subtle dot grid */}
      <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(#999999 0.5px, transparent 0.5px)', backgroundSize: '20px 20px' }}></div>
      <svg ref={svgRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
