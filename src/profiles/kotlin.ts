import { ProjectProfile } from "./types";

const kotlin: ProjectProfile = {
  id: "kotlin-default",
  name: "Kotlin",
  detectFiles: ["build.gradle.kts", "settings.gradle.kts"],
  customDetect: (root, fs, path) => {
    try {
      const gradlePath = path.join(root, "build.gradle.kts");
      const gradleGroovyPath = path.join(root, "build.gradle");
      let content = "";
      if (fs.existsSync(gradlePath)) content += fs.readFileSync(gradlePath, "utf8");
      if (fs.existsSync(gradleGroovyPath)) content += fs.readFileSync(gradleGroovyPath, "utf8");

      if (content.includes("com.android.application") || content.includes("com.android.library")) return "Android";
      if (content.includes("io.ktor")) return "Ktor";
      return null;
    } catch { return null; }
  },
  targetExts: [".kt", ".kts"],
  ignoreFolders: ["build", ".gradle", "bin", "out"],
  analysisLogic: "Kotlin Logic",
  logicFeatures: "Supports Android and Ktor framework",
  icon: "🎯"
};

export default [kotlin];
