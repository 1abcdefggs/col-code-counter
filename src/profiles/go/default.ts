import { ProjectProfile } from "../types";

const gin: ProjectProfile = {
  id: "gin",
  name: "Gin",
  detectFiles: ["go.mod"],
  customDetect: (root, fs, path) => {
    const modPath = path.join(root, "go.mod");
    if (fs.existsSync(modPath)) {
      const content = fs.readFileSync(modPath, "utf8");
      return content.includes("github.com/gin-gonic/gin") ? "Gin Web Framework" : null;
    }
    return null;
  },
  targetExts: [".go", ".json", ".yml", ".html"],
  ignoreFolders: ["bin", "out"],
  dependencyFolders: ["vendor"],
  analysisLogic: "Gin Logic",
  logicFeatures: "Gin-specific project analysis",
  icon: "🐹"
};

const echo: ProjectProfile = {
  id: "echo",
  name: "Echo",
  detectFiles: ["go.mod"],
  customDetect: (root, fs, path) => {
    const modPath = path.join(root, "go.mod");
    if (fs.existsSync(modPath)) {
      const content = fs.readFileSync(modPath, "utf8");
      return content.includes("github.com/labstack/echo") ? "Echo Web Framework" : null;
    }
    return null;
  },
  targetExts: [".go", ".json", ".yml", ".html"],
  ignoreFolders: ["bin", "out"],
  dependencyFolders: ["vendor"],
  analysisLogic: "Echo Logic",
  logicFeatures: "Echo-optimized Go analysis",
  icon: "🐹"
};

const goGeneric: ProjectProfile = {
  id: "go-generic",
  name: "Go",
  detectFiles: ["go.mod"],
  targetExts: [".go", ".html", ".json"],
  ignoreFolders: ["bin", "pkg"],
  dependencyFolders: ["vendor"],
  analysisLogic: "Go Logic",
  logicFeatures: "Standard Go project rules",
  icon: "🐹"
};

export default [gin, echo, goGeneric];
