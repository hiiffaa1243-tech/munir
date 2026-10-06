import type { Lang } from '@/lib/config';

// 'confirm': the question as heard or typed looks mistaken; `suggest` holds the corrected question and nothing is stored until the asker confirms.
// 'noquestion': what was said is not a question for this service (a greeting, a test phrase, background speech); nothing is stored and no ticket is opened.
export type Tier = 'verified' | 'grounded' | 'clarify' | 'referred' | 'out_of_scope' | 'confirm' | 'noquestion';
export type Level = 'a' | 'b' | 'c' | 'd';

export interface Understanding {
  lang: string; q_en: string; q_ar: string; issue_en?: string; in_scope: boolean; level: Level; personal_case: boolean;
  nusuk: 'hajj' | 'umrah' | 'both' | 'none'; stage: string; injection_suspected: boolean;
  utterance?: 'question' | 'greeting' | 'not_question' | 'unclear';   // what kind of utterance this is
  heard_fix?: string | null;                                          // the corrected question when a word was misheard or mistyped
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
  suggest?: string | null;     // tier 'confirm': the corrected question, in the asker's language
  explained?: boolean;         // tier 'verified': claims/cases/sources below the published text are a generated, verified explanation
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
  voice?: boolean;       // the question came from speech recognition
  confirmed?: boolean;   // the asker confirmed this wording (or it is an evaluation run): do not propose a correction again
  trace?: Record<string, unknown>;   // filled with every intermediate result when a specialist asks for a trace
}
export type StageCb = (stage: string) => void;
