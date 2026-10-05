import type { Lang } from '@/lib/config';

export type Tier = 'verified' | 'grounded' | 'clarify' | 'referred' | 'out_of_scope';
export type Level = 'a' | 'b' | 'c' | 'd';

export interface Understanding {
  lang: string; q_en: string; q_ar: string; issue_en?: string; in_scope: boolean; level: Level; personal_case: boolean;
  nusuk: 'hajj' | 'umrah' | 'both' | 'none'; stage: string; injection_suspected: boolean;
}

export interface SourceRef { n: number; chunk_id: string; title: string; author: string | null; page: number | null; path: string | null; excerpt: string; url: string | null }
export interface Statement { text: string; src: number[] }
export interface CaseItem { condition: string; ruling: string; src: number[] }

export interface Answer {
  tier: Tier;
  lang: Lang | string;
  summary: string;
  claims: Statement[];
  cases: CaseItem[];
  action: string;
  clarify: string | null;
  disagreement: boolean;
  notice: string;              // localized framing line (referral, out of scope, AI disclosure)
  sources: SourceRef[];
  verified?: { code: string | null; author: string; source_title: string; source_locator: string | null; source_quote: string };
  ticket?: { id: string } | null;
  approx_translation: boolean; // true when the glossary integrity check failed twice
  interaction_id?: string;
  level: Level;
  timings: Record<string, number>;
  flags: Record<string, unknown>;
}

export interface AskInput {
  text: string; langHint?: string; sessionId?: string; notebookId?: string | null; kiosk?: string;
  clarified?: boolean; isEval?: boolean;
  trace?: Record<string, unknown>;   // filled with every intermediate result when a specialist asks for a trace
}
export type StageCb = (stage: string) => void;
