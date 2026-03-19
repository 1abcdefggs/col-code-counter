import { ProjectProfile } from "./types";

const rails: ProjectProfile = {
  id: "rails",
  name: "Rails",
  detectFiles: ["Gemfile"],
  customDetect: (root, fs, path) => {
    const gemfilePath = path.join(root, "Gemfile");
    if (fs.existsSync(gemfilePath)) {
      const content = fs.readFileSync(gemfilePath, "utf8");
      return (content.includes("gem 'rails'") || content.includes('gem "rails"')) ? "Ruby on Rails App" : null;
    }
    return null;
  },
  targetExts: [".rb", ".erb", ".yml", ".html"],
  ignoreFolders: ["log", "tmp", "public/assets", "storage"],
  dependencyFolders: ["vendor/bundle", ".bundle", "vendor"],
  analysisLogic: "Rails Logic",
  logicFeatures: "Rails-specific rules (ignores log, tmp, storage)",
  icon: "💎"
};

const rubyGeneric: ProjectProfile = {
  id: "ruby-generic",
  name: "Ruby",
  detectFiles: ["Gemfile", "Rakefile"],
  targetExts: [".rb", ".yml"],
  ignoreFolders: ["log", "tmp"],
  dependencyFolders: ["vendor/bundle", ".bundle", "vendor"],
  analysisLogic: "Ruby Logic",
  logicFeatures: "Standard Ruby project rules",
  icon: "💎"
};

export default [rails, rubyGeneric];

