import * as vscode from "vscode";

/**
 * Special item for the Statistics Dashboard.
 */
export class DashboardItem extends vscode.TreeItem {
  constructor(
    public readonly stats: {
      avg: number;
      max: number;
      min: number;
      totalFiles: number;
    },
    public readonly projectName: string = "",
    public readonly projectRoot: string = "",
  ) {
    super(
      `📊 Workspace Summary`,
      vscode.TreeItemCollapsibleState.Expanded,
    );
    this.contextValue = "dashboard";
    const config = vscode.workspace.getConfiguration("codeCount");
    const enabled = config.get<boolean>("enabled") ?? true;
    this.description = (projectName ? `📁 ${projectName}` : "") + (enabled ? "" : " (PAUSED)");
    this.tooltip = (projectRoot
      ? `Project: ${projectRoot}\nOverall workspace line count statistics`
      : "Overall workspace line count statistics") + (enabled ? "" : "\n\nMonitoring is currently PAUSED.");
  }
}

export class StatDetailItem extends vscode.TreeItem {
  constructor(label: string, value: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = value;
  }
}

/**
 * stylized action button for the sidebar tree
 */
export class SidebarActionButton extends vscode.TreeItem {
  constructor(label: string, commandId: string, iconId: string, tooltip?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = {
      command: commandId,
      title: label
    };
    this.iconPath = new vscode.ThemeIcon(iconId);
    this.tooltip = tooltip;
    this.contextValue = "actionButton";
  }
}
