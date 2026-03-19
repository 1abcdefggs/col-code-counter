import { configsCategory } from "./configs";
import { osCategory } from "./os";
import { ideCategory } from "./ide";
import { genericCategory } from "./generic";
import { ExcludeCategory } from "./types";

export * from "./types";

export const systemExcludes: ExcludeCategory[] = [
  configsCategory,
  osCategory,
  ideCategory,
  genericCategory
];
