export interface ExcludeItem {
  id: string;
  name: string;
  description: string;
  pattern: string; // The exact name or a simple pattern (e.g. '.git', '.DS_Store')
  type: 'file' | 'directory' | 'both';
  defaultEnabled: boolean;
}

export interface ExcludeCategory {
  id: string;
  name: string;
  items: ExcludeItem[];
}
