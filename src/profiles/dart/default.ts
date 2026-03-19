import { ProjectProfile } from "../types";

const dartFlutter: ProjectProfile = {
  id: "dart-default",
  name: "Dart / Flutter",
  detectFiles: ["pubspec.yaml"],
  customDetect: (root, fs, path) => {
    try {
      const pubspecPath = path.join(root, "pubspec.yaml");
      if (fs.existsSync(pubspecPath)) {
        const content = fs.readFileSync(pubspecPath, "utf8");
        if (content.includes("sdk: flutter")) return "Flutter";
        if (content.includes("shelf:")) return "Shelf";
      }
      return null;
    } catch { return null; }
  },
  targetExts: [".dart", ".yaml"],
  ignoreFolders: ["build", ".dart_tool"],
  dependencyFolders: [".pub-cache"],
  analysisLogic: "Dart Logic",
  logicFeatures: "Standard project analysis rules",
  icon: "🎯"
};

export default [dartFlutter];
