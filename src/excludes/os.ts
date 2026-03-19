import { ExcludeCategory } from "./types";

export const osCategory: ExcludeCategory = {
  id: "os",
  name: "OS-Specific Files",
  items: [
    {
      id: "ds_store",
      name: ".DS_Store",
      description: "macOS directory metadata file.",
      pattern: ".ds_store",
      type: "file",
      defaultEnabled: true
    },
    {
      id: "thumbs_db",
      name: "Thumbs.db",
      description: "Windows thumbnail cache file.",
      pattern: "thumbs.db",
      type: "file",
      defaultEnabled: true
    },
    {
      id: "desktop_ini",
      name: "desktop.ini",
      description: "Windows folder customization file.",
      pattern: "desktop.ini",
      type: "file",
      defaultEnabled: true
    },
    {
      id: "macosx",
      name: "__MACOSX",
      description: "macOS specialized resource fork folder.",
      pattern: "__macosx",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "spotlight",
      name: ".Spotlight-V100",
      description: "macOS Spotlight indexing metadata.",
      pattern: ".spotlight-v100",
      type: "directory",
      defaultEnabled: true
    },
    {
      id: "trashes",
      name: ".Trashes",
      description: "macOS system trash folder.",
      pattern: ".trashes",
      type: "directory",
      defaultEnabled: true
    }
  ]
};
