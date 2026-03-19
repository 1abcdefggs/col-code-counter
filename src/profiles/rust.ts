import { ProjectProfile } from "./types";

const rust: ProjectProfile = {
  id: "rust-default",
  name: "Rust",
  detectFiles: ["Cargo.toml"],
  detect: (root) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const cargoPath = path.join(root, "Cargo.toml");
      return fs.existsSync(cargoPath);
    } catch { return false; }
  },
  customDetect: (root, fs, path) => {
    try {
      const cargoPath = path.join(root, "Cargo.toml");
      if (fs.existsSync(cargoPath)) {
        const content = fs.readFileSync(cargoPath, "utf8");
        if (content.includes("actix-web")) return "Actix";
        if (content.includes("rocket")) return "Rocket";
        if (content.includes("axum")) return "Axum";
        return "Rust Project"; // Even if none of the above apply, it will be detected as a Rust project.
      }
      return null;
    } catch { return null; }
  },
  targetExts: [".rs"],
  ignoreFolders: ["debug", "release"],
  dependencyFolders: ["target"],
  analysisLogic: "Rust Logic",
  logicFeatures: "Standard project analysis rules",
  icon: "🦀"
};

export default [rust];
