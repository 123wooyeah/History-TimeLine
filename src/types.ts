export interface Person {
  id: string;
  name: string;
  aliases: string[];
  birth: number;
  death: number | null;
  birthApprox: boolean;
  deathApprox: boolean;
  dynasty: string;
  country: string;
  field: string;
  description: string;
}

export interface Dynasty {
  name: string;
  start: number;
  end: number;
  startApprox: boolean;
  endApprox: boolean;
  color: string;
}

export type SortMode = 'default' | 'birth' | 'death' | 'dynasty' | 'field';

export const FIELD_COLORS: Record<string, string> = {
  '思想家': '#6B8E23',
  '政治家': '#B22222',
  '军事家': '#4682B4',
  '文学家': '#8B4513',
  '史学家': '#556B2F',
  '科学家': '#2E8B57',
  '艺术家': '#9370DB',
  '探险家': '#DAA520',
};
