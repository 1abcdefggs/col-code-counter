import { ProjectProfile } from "./types";

// Generic check helper
const hasDep = (pkg: any, dep: string) => {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return !!deps[dep];
};

const nextjs: ProjectProfile = {
  id: "nextjs",
  name: "Next.js",
  detectFiles: ["next.config.js", "next.config.mjs", "next.config.ts", "next-env.d.ts"],
  customDetect: (root: string, fs: any, path: any) => {
    try {
      const pkgPath = path.join(root, "package.json");
      if (!fs.existsSync(pkgPath)) return null;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      return hasDep(pkg, "next") ? "Next.js App" : null;
    } catch { return null; }
  },
  targetExts: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".scss"],
  ignoreFolders: [".next", "out"],
  dependencyFolders: ["node_modules"],
  sourceUrls: [
    { label: "Project Structure", url: "https://nextjs.org/docs/app/getting-started/project-structure" },
    { label: "Installation", url: "https://nextjs.org/docs/app/getting-started/installation" },
    { label: "Static Exports", url: "https://nextjs.org/docs/app/guides/static-exports" }
  ],
  analysisLogic: "Next.js Logic",
  logicFeatures: "Ignores .next (build cache) and out (static export)",
  icon: "⚛️"
};

const vite: ProjectProfile = {
  id: "vite",
  name: "Vite",
  detectFiles: ["vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.cjs"],
  targetExts: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".scss", ".html"],
  ignoreFolders: ["dist"],
  dependencyFolders: ["node_modules"],
  sourceUrls: [
    { label: "Scaffolding", url: "https://vite.dev/guide/#scaffolding-your-first-vite-project" },
    { label: "Build Guide", url: "https://vite.dev/guide/build" }
  ],
  analysisLogic: "Vite Logic",
  logicFeatures: "Ignores dist (vite build output)",
  icon: "⚡"
};

const nuxt: ProjectProfile = {
  id: "nuxt",
  name: "Nuxt.js",
  detectFiles: ["nuxt.config.ts", "nuxt.config.js"],
  customDetect: (root: string, fs: any, path: any) => {
    try {
      const pkgPath = path.join(root, "package.json");
      if (!fs.existsSync(pkgPath)) return null;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      return hasDep(pkg, "nuxt") ? "Nuxt.js App" : null;
    } catch { return null; }
  },
  targetExts: [".vue", ".ts", ".js", ".json", ".css", ".scss", ".html"],
  ignoreFolders: [".nuxt", ".output", "dist"],
  dependencyFolders: ["node_modules"],
  sourceUrls: [
    { label: "Project Structure", url: "https://nuxt.com/docs/guide/directory-structure" }
  ],
  analysisLogic: "Nuxt.js Logic",
  logicFeatures: "Ignores .nuxt (dev cache) and .output (production build)",
  icon: "🟢"
};

const nestjs: ProjectProfile = {
  id: "nestjs",
  name: "NestJS",
  detectFiles: ["nest-cli.json"],
  customDetect: (root: string, fs: any, path: any) => {
    try {
      const pkgPath = path.join(root, "package.json");
      if (!fs.existsSync(pkgPath)) return null;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      return hasDep(pkg, "@nestjs/core") ? "NestJS Backend" : null;
    } catch { return null; }
  },
  targetExts: [".js", ".mjs", ".cjs", ".ts", ".json"],
  ignoreFolders: ["dist", "out", "build"],
  dependencyFolders: ["node_modules"],
  sourceUrls: [
    { label: "First Steps", url: "https://docs.nestjs.com/first-steps" },
    { label: "CLI Overview", url: "https://docs.nestjs.com/cli/overview" }
  ],
  analysisLogic: "NestJS Logic",
  logicFeatures: "Ignores dist (tsc compilation output)",
  icon: "🦁"
};

const reactNative: ProjectProfile = {
  id: "react-native",
  name: "React Native",
  detectFiles: ["app.json", "metro.config.js", "react-native.config.js"],
  customDetect: (root: string, fs: any, path: any) => {
    try {
      const pkgPath = path.join(root, "package.json");
      if (!fs.existsSync(pkgPath)) return null;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (hasDep(pkg, "react-native")) {
        return hasDep(pkg, "expo") ? "Expo (React Native)" : "React Native App";
      }
      return null;
    } catch { return null; }
  },
  targetExts: [".js", ".jsx", ".ts", ".tsx", ".json"],
  ignoreFolders: ["android", "ios", ".expo"],
  dependencyFolders: ["node_modules"],
  sourceUrls: [
    { label: "Getting Started", url: "https://reactnative.dev/docs/getting-started" },
    { label: "Expo Guide", url: "https://docs.expo.dev/get-started/create-a-project/" }
  ],
  analysisLogic: "React Native Logic",
  logicFeatures: "Ignores android/ios (native platform) and .expo (cache)",
  icon: "📱"
};

const webFrontend: ProjectProfile = {
  id: "web-frontend",
  name: "Web Frontend",
  detectFiles: ["index.html", "manifest.json"],
  customDetect: (root: string, fs: any, path: any) => {
    try {
      const pkgPath = path.join(root, "package.json");
      if (!fs.existsSync(pkgPath)) return null;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (pkg.engines?.vscode) return "VS Code Extension";
      if (fs.existsSync(path.join(root, "manifest.json"))) {
        try {
          const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
          if (manifest.manifest_version) return "Chrome Extension";
        } catch { /* ignore malformed manifest.json */ }
      }

      if (deps.react) return "React App";
      if (deps.vue) return "Vue.js App";
      if (deps.svelte) return "Svelte App";
      if (deps["@angular/core"]) return "Angular App";

      return null;
    } catch { return null; }
  },
  targetExts: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".scss", ".html", ".vue", ".svelte"],
  ignoreFolders: ["build", "dist"],
  dependencyFolders: ["node_modules"],
  sourceUrls: [
    { label: "CRA Docs", url: "https://create-react-app.dev/docs/getting-started" },
    { label: "Angular CLI", url: "https://angular.dev/tools/cli" },
    { label: "Vue Quick Start", url: "https://vuejs.org/guide/quick-start" },
    { label: "Svelte Intro", url: "https://svelte.dev/docs/introduction" }
  ],
  analysisLogic: "Web Frontend Logic",
  logicFeatures: "Ignores build/dist (common bundler output)",
  icon: "🌐"
};

const nodejsBackend: ProjectProfile = {
  id: "nodejs-backend",
  name: "Node.js Backend",
  detectFiles: [],
  customDetect: (root: string, fs: any, path: any) => {
    try {
      const pkgPath = path.join(root, "package.json");
      if (!fs.existsSync(pkgPath)) return null;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const hasCommonFrontend = deps.react || deps.vue || deps.svelte || deps["@angular/core"];
      return !hasCommonFrontend ? "Node.js App" : null;
    } catch { return null; }
  },
  targetExts: [".ts", ".js", ".json"],
  ignoreFolders: ["dist", "build"],
  dependencyFolders: ["node_modules"],
  sourceUrls: [
    { label: "Node.js Intro", url: "https://nodejs.org/en/learn/getting-started/introduction-to-nodejs" }
  ],
  analysisLogic: "Node.js Logic",
  logicFeatures: "Ignores dist (compilation output)",
  icon: "⚙️"
};

export default [nextjs, vite, nuxt, nestjs, reactNative, webFrontend, nodejsBackend];

