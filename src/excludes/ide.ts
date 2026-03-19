import { ExcludeCategory } from "./types";

export const ideCategory: ExcludeCategory = {
  id: "ide",
  name: "IDE-Specific Folders",
  items: [
    {
      id: "idea",
      name: ".idea",
      description: "IntelliJ IDEA project configuration folder.",
      pattern: ".idea",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "project",
      name: ".project",
      description: "Eclipse project configuration file.",
      pattern: ".project",
      type: "file",
      defaultEnabled: true
    },
    {
      id: "settings",
      name: ".settings",
      description: "Eclipse project settings folder.",
      pattern: ".settings",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "visual_studio",
      name: ".vs",
      description: "Visual Studio 2015+ project cache folder.",
      pattern: ".vs",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "local_history",
      name: ".history",
      description: "Local history files from VS Code extensions.",
      pattern: ".history",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "vim_swap",
      name: "Vim Swap",
      description: "Vim editor temporary swap files.",
      pattern: "*.sw?",
      type: "file",
      defaultEnabled: true
    },
    {
      id: "obsidian",
      name: ".obsidian",
      description: "Obsidian vault configuration folder.",
      pattern: ".obsidian",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "gemini",
      name: ".gemini",
      description: "Google Gemini AI agent configuration folder.",
      pattern: ".gemini",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "idx",
      name: ".idx",
      description: "Google Project IDX configuration folder.",
      pattern: ".idx",
      type: "directory",
      defaultEnabled: true
    }
  ]
};
