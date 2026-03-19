import { ProjectProfile } from "./types";

const laravel: ProjectProfile = {
  id: "laravel",
  name: "Laravel",
  detectFiles: ["composer.json", "artisan"],
  customDetect: (root: string, fs: any, path: any) => {
    const composerPath = path.join(root, "composer.json");
    if (!fs.existsSync(composerPath)) return null;
    const composer = JSON.parse(fs.readFileSync(composerPath, "utf8"));
    const deps = { ...composer.require, ...composer["require-dev"] };
    return deps["laravel/framework"] ? "Laravel Web App" : null;
  },
  targetExts: [".php", ".html", ".js", ".css"],
  ignoreFolders: ["storage", "bootstrap/cache", "public/storage"],
  dependencyFolders: ["vendor"],
  analysisLogic: "Laravel Logic",
  logicFeatures: "Laravel-specific rules (ignores storage and cache folders)",
  icon: "🐘"
};

const wordpress: ProjectProfile = {
  id: "wordpress",
  name: "WordPress",
  detectFiles: ["wp-config.php", "index.php"],
  customDetect: (root: string, fs: any, path: any) => {
    if (fs.existsSync(path.join(root, "wp-config.php")) || fs.existsSync(path.join(root, "wp-content"))) {
      return "WordPress Site";
    }
    return null;
  },
  targetExts: [".php", ".html", ".js", ".css"],
  ignoreFolders: ["wp-content/uploads", "wp-content/upgrade", "wp-content/cache", "wp-includes", "wp-admin"],
  dependencyFolders: ["vendor"],
  analysisLogic: "WordPress Logic",
  logicFeatures: "WordPress core analysis (ignores admin/includes)",
  icon: "🏢"
};

const phpGeneric: ProjectProfile = {
  id: "php-generic",
  name: "PHP",
  detectFiles: ["composer.json", "index.php"],
  targetExts: [".php"],
  ignoreFolders: [],
  dependencyFolders: ["vendor"],
  analysisLogic: "PHP Logic",
  logicFeatures: "Standard PHP project rules",
  icon: "⚙️"
};

export default [laravel, wordpress, phpGeneric];
