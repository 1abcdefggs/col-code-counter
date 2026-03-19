# Project Profiles

This directory contains definitions for various project types. These profiles help the **Code Count** extension automatically identify project types, suggest relevant file extensions, and auto-exclude common "noise" folders like build artifacts and dependency directories.

## Directory Structure

```text
profiles/
├── types.ts          # Common ProjectProfile interface
├── index.ts          # AUTO-GENERATED — do not edit manually
├── README.md         # This file
└── [language]/       # Language-specific directory
    └── default.ts    # Default profile definitions for the language
```

## How to Add a New Language

1.  **Create a directory** for the language under `src/profiles/` (e.g., `swift/`).
2.  **Create `default.ts`** in that directory with a default array export:

    ```typescript
    import { ProjectProfile } from "../types";

    const swift: ProjectProfile = {
      id: "swift",
      name: "Swift",
      detectFiles: ["Package.swift"],
      targetExts: [".swift"],
      ignoreFolders: [".build", "DerivedData"],
    };

    export default [swift];
    ```

3.  **Run `npm run compile`** — that's it! The `index.ts` will be auto-generated.

> **No manual import/export editing is required.** The build script `scripts/gen-profiles.js` automatically scans all directories containing `default.ts` and generates `index.ts`.

## Priority Order

- Profiles are matched using `Array.find()` (first match wins).
- More specific profiles (e.g., Web Frontend with `customDetect`) should appear before general ones (e.g., Node.js Backend).
- The `generic` profile is always placed last as a fallback.

## Interface Definition (`ProjectProfile`)

| Field           | Type        | Description                               |
| --------------- | ----------- | ----------------------------------------- |
| `id`            | `string`    | Unique identifier                         |
| `name`          | `string`    | Human-readable name shown in UI           |
| `detectFiles`   | `string[]`  | Root files to look for (supports `*.ext`) |
| `customDetect`  | `function?` | Optional advanced detection logic         |
| `targetExts`    | `string[]`  | Primary code extensions to focus on       |
| `ignoreFolders` | `string[]`  | Directories to auto-exclude from count    |
