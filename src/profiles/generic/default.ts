import { ProjectProfile } from "../types";

const generic: ProjectProfile = {
  id: "generic",
  name: "Generic",
  detectFiles: [],
  targetExts: [".txt", ".md"],
  ignoreFolders: [".git", ".vscode", ".github"],
  dependencyFolders: ["node_modules", "vendor", "venv", ".venv", "deps"],
  analysisLogic: "Generic Logic",
  logicFeatures: "Standard project analysis rules",
  icon: "⚙️"
};

export default [generic];
