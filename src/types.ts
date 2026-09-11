export interface Person {
  id: string;
  name: string;
  aliases: string[];
  birth: number;
  death: number | null;
  birthApprox: boolean;
  deathApprox: boolean;
  birthUnknown: boolean; // 生年不详（精度低于百年，如世纪级）
  deathUnknown: boolean; // 卒年不详（精度低于百年，如世纪级）
  dynasty: string;
  country: string;
  field: string;
  description: string;
}

export interface HistoricalEvent {
  id: string;
  name: string;
  aliases: string[];
  startYear: number;
  endYear: number | null;
  startApprox: boolean;
  endApprox: boolean;
  startUnknown: boolean; // 始年不详
  endUnknown: boolean; // 终年不详
  category: string;
  location: string;
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

export type SortMode = 'default' | 'birth' | 'death' | 'dynasty' | 'field' | 'eventRelevance';
export type SearchMode = 'people' | 'events';

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

export const EVENT_CATEGORY_COLORS: Record<string, string> = {
  '战争': '#c0392b',
  '革命': '#e74c3c',
  '政治': '#8e44ad',
  '文化': '#27ae60',
  '科技': '#2980b9',
  '外交': '#16a085',
  '经济': '#f39c12',
  '社会': '#d35400',
  '其他': '#7f8c8d',
};
