import { ExcludeCategory } from "./types";

export const genericCategory: ExcludeCategory = {
  id: "generic_hidden",
  name: "Generic Hidden Folders",
  items: [
    {
      id: "generic",
      name: ".* / _*",
      description: "Any other folder starting with a dot or underscore (e.g., .vercel, .env).",
      pattern: "", // Handled manually via startsWith('.') and startsWith('_')
      type: "directory",
      defaultEnabled: true
    }
  ]
};
