import { ExcludeCategory } from "./types";

export const configsCategory: ExcludeCategory = {
  id: "configs",
  name: "Standard Configs",
  items: [
    {
      id: "sys_git",
      name: ".git",
      description: "Git version control system metadata.",
      pattern: ".git",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "vscode",
      name: ".vscode",
      description: "Visual Studio Code project-specific settings.",
      pattern: ".vscode",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "github",
      name: ".github",
      description: "GitHub workflows, actions, and templates.",
      pattern: ".github",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "gitlab",
      name: ".gitlab",
      description: "GitLab CI/CD and issue templates.",
      pattern: ".gitlab",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "husky",
      name: ".husky",
      description: "Git hooks configuration.",
      pattern: ".husky",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "svn",
      name: ".svn",
      description: "Subversion version control metadata.",
      pattern: ".svn",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "mercurial",
      name: ".hg",
      description: "Mercurial version control metadata.",
      pattern: ".hg",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "npm_cache",
      name: ".npm",
      description: "npm local cache directory.",
      pattern: ".npm",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "yarn_cache",
      name: ".yarn",
      description: "Yarn package manager metadata/cache.",
      pattern: ".yarn",
      type: "directory",
      defaultEnabled: true
    }
  ]
};
