import { ProjectProfile } from "./types";

const csharp: ProjectProfile = {
  id: "csharp-default",
  name: "C#",
  detectFiles: ["*.csproj", "*.sln"],
  customDetect: (root, fs, path) => {
    try {
      const files = fs.readdirSync(root);
      const csproj = files.find((f: string) => f.endsWith(".csproj"));
      if (csproj) {
        const content = fs.readFileSync(path.join(root, csproj), "utf8");
        if (content.includes("UnityEngine")) return "Unity";
        if (content.includes("Microsoft.NET.Sdk.Web")) return "ASP.NET Core";
        if (content.includes("Microsoft.AspNetCore.Components.WebAssembly")) return "Blazor";
      }
      if (fs.existsSync(path.join(root, "Assets")) && fs.existsSync(path.join(root, "ProjectSettings"))) return "Unity";
      return null;
    } catch { return null; }
  },
  targetExts: [".cs", ".xaml", ".json", ".config"],
  ignoreFolders: ["bin", "obj", ".vs", "TestResults"],
  analysisLogic: "C# Logic",
  logicFeatures: "Standard project analysis rules",
  icon: "🎯"
};

export default [csharp];
