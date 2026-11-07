export type RehearseStepKind = "node" | "sql";

export interface RehearseStep {
  id: string;
  title: string;
  kind: RehearseStepKind;
  file: string;
  after: string[];
  media?: boolean;
  note?: string;
}

export declare const STEPS: RehearseStep[];
