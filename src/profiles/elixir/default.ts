import { ProjectProfile } from "../types";

const elixir: ProjectProfile = {
  id: "elixir-default",
  name: "Elixir",
  detectFiles: ["mix.exs"],
  customDetect: (root, fs, path) => {
    try {
      const mixPath = path.join(root, "mix.exs");
      if (fs.existsSync(mixPath)) {
        const content = fs.readFileSync(mixPath, "utf8");
        if (content.includes(":phoenix")) return "Phoenix";
      }
      return null;
    } catch { return null; }
  },
  targetExts: [".ex", ".exs", ".heex", ".leex"],
  ignoreFolders: ["_build"],
  dependencyFolders: ["deps"],
  analysisLogic: "Elixir Logic",
  logicFeatures: "Supports Phoenix framework",
  icon: "💧"
};

export default [elixir];
