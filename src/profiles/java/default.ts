import { ProjectProfile } from "../types";

const springBoot: ProjectProfile = {
  id: "spring-boot",
  name: "Spring Boot",
  detectFiles: ["pom.xml", "build.gradle"],
  customDetect: (root, fs, path) => {
    const gradlePath = path.join(root, "build.gradle");
    const pomPath = path.join(root, "pom.xml");
    let content = "";
    if (fs.existsSync(gradlePath)) content += fs.readFileSync(gradlePath, "utf8");
    if (fs.existsSync(pomPath)) content += fs.readFileSync(pomPath, "utf8");
    return content.includes("spring-boot") ? "Spring Boot App" : null;
  },
  targetExts: [".java", ".properties", ".xml", ".yml", ".yaml"],
  ignoreFolders: ["build", ".gradle", "bin", "out"],
  dependencyFolders: ["target", "lib", "vendor"],
  analysisLogic: "Spring Boot Logic",
  logicFeatures: "Spring-specific analysis (ignores target/build folders)",
  icon: "🍃"
};

const android: ProjectProfile = {
  id: "android-java",
  name: "Android (Java)",
  detectFiles: ["build.gradle", "AndroidManifest.xml"],
  customDetect: (root, fs, path) => {
    const gradlePath = path.join(root, "build.gradle");
    if (fs.existsSync(gradlePath)) {
      const content = fs.readFileSync(gradlePath, "utf8");
      if (content.includes("com.android.application") || content.includes("com.android.library")) {
        return "Android Project";
      }
    }
    return null;
  },
  targetExts: [".java", ".xml", ".gradle"],
  ignoreFolders: ["build", ".gradle", "app/build", ".externalNativeBuild"],
  analysisLogic: "Android Logic",
  logicFeatures: "Android-optimized Java analysis",
  icon: "🤖"
};

const javaGeneric: ProjectProfile = {
  id: "java-generic",
  name: "Java",
  detectFiles: ["pom.xml", "build.gradle", "settings.gradle"],
  targetExts: [".java", ".properties", ".xml"],
  ignoreFolders: ["build", ".gradle", "bin", "out"],
  dependencyFolders: ["target", "lib", "vendor"],
  analysisLogic: "Java Logic",
  logicFeatures: "Standard Java project rules",
  icon: "☕"
};

export default [springBoot, android, javaGeneric];

