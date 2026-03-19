import { ProjectProfile } from "./types";

const swift: ProjectProfile = {
  id: "swift-default",
  name: "Swift",
  detectFiles: ["Package.swift", "*.xcodeproj", "*.xcworkspace"],
  customDetect: (root, fs, path) => {
    try {
      const files = fs.readdirSync(root);
      if (files.some((f: string) => f.endsWith(".xcodeproj") || f.endsWith(".xcworkspace"))) return "iOS / macOS";
      if (fs.existsSync(path.join(root, "Package.swift"))) {
        const content = fs.readFileSync(path.join(root, "Package.swift"), "utf8");
        if (content.includes("Vapor")) return "Vapor (Server-side)";
        return "Swift Package";
      }
      return null;
    } catch { return null; }
  },
  targetExts: [".swift"],
  ignoreFolders: [".build", ".swiftpm", "DerivedData"],
  analysisLogic: "Swift Logic",
  logicFeatures: "Supports iOS, macOS, and Vapor framework",
  icon: "🐦"
};

export default [swift];
