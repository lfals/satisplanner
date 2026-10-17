import raw from "./game-data.json";
import type { GameData, Recipe } from "./types";

export const gameData = raw as GameData;

const recipesByOutput = new Map<string, Recipe[]>();
for (const recipe of gameData.recipes) {
  for (const output of recipe.outputs) {
    const list = recipesByOutput.get(output.itemId) ?? [];
    list.push(recipe);
    recipesByOutput.set(output.itemId, list);
  }
}

export function recipesProducing(itemId: string): Recipe[] {
  return recipesByOutput.get(itemId) ?? [];
}

export function itemName(itemId: string): string {
  return gameData.items.find((item) => item.id === itemId)?.name ?? itemId;
}

export const resourceIds = new Set(gameData.resources.map((resource) => resource.id));
