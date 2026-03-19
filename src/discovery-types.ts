/**
 * Shared data structure produced by STEP A (Discovery) and consumed by STEP B (Filter/Strategist View).
 * Contains only raw filesystem metadata — no exclusion flags.
 * Exclusion logic is applied at render time in STEP B based on current toggle states.
 */
export interface DiscoveryNode {
  name: string;
  relPath: string;
  isDir: boolean;
  children: DiscoveryNode[];
  ignoreReason?: string;
}

export interface ReportNode {
  name: string;
  fullPath?: string;
  lines: number;
  delta: number;
  codeChars: number;
  commentChars: number;
  totalChars: number;
  children: Map<string, ReportNode>;
  isFile: boolean;
  level: number;
  imports: { active: number; inactive: number };
  fileCount: number;
  hasWarning: boolean;
}
