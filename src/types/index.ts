export type EntityType = 'domain' | 'problem' | 'concept' | 'prerequisite' | 'component' | 'mechanism' | 'application' | 'contrast' | 'other';

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  description: string;
  depth: number;
  expanded: boolean;
}

export interface Relation {
  source: string;
  target: string;
  relation: string;
}

export interface GraphState {
  nodes: Entity[];
  edges: Relation[];
}

export interface PanelState {
  selectedEntityId: string | null;
  analysisContent: string;
  suggestedExplorations: string[];
  isLoading: boolean;
}
