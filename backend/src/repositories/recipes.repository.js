const { v4: uuid } = require("uuid");
const paths = require("../config/paths");
const tenantContext = require("../context/tenantContext");
const { safeReadJson, atomicWriteJson } = require("../utils/safeFileIO");

let recipes = [];
let lastRecipePath = null;

function getDataPath() {
  return paths.tenant(tenantContext.getRestaurantId(), "recipes.json");
}

function readRecipes() {
  const dataPath = getDataPath();
  const data = safeReadJson(dataPath, { recipes: [] });
  let list = Array.isArray(data) ? data : (data.recipes && Array.isArray(data.recipes) ? data.recipes : null);
  if (list == null && data && typeof data === "object" && !Array.isArray(data)) list = [data];
  if (!Array.isArray(list)) list = [];
  return list.map((r) => normalizeRecipeFromFile(r));
}

function normalizeRecipeFromFile(r) {
  const menuItemName = String(r.menuItemName || r.menu_item_name || r.name || "").trim();
  const ingredients = Array.isArray(r.ingredients)
    ? r.ingredients.map((i) => ({
        name: String(i.name || "").trim(),
        quantity: Number(i.quantity) ?? Number(i.qty) ?? 0,
        unit: String(i.unit || "").trim(),
        unitCost: Number(i.unitCost) ?? Number(i.cost_per_unit) ?? 0,
      }))
    : [];
  return {
    id: r.id || uuid(),
    menuItemName,
    menu_item_name: menuItemName,
    area: r.area || "cucina",
    ingredients,
    note: r.note || "",
  };
}

function writeRecipes(list) {
  atomicWriteJson(getDataPath(), { recipes: list });
}

function ensureLoaded() {
  const currentPath = getDataPath();
  if (recipes.length === 0 || lastRecipePath !== currentPath) {
    lastRecipePath = currentPath;
    recipes = readRecipes();
  }
}

// GET ALL
async function getAll() {
  ensureLoaded();
  return recipes;
}

// GET BY ID
async function getById(id) {
  ensureLoaded();
  return recipes.find((r) => r.id === id) || null;
}

// GET BY MENU ITEM NAME (alias findRecipeByMenuItemName)
async function getByMenuItemName(name) {
  ensureLoaded();
  const normalized = String(name || "").trim().toLowerCase();
  return (
    recipes.find(
      (r) =>
        String(r.menuItemName || r.menu_item_name || "").trim().toLowerCase() === normalized
    ) || null
  );
}

async function findRecipeByMenuItemName(name) {
  return getByMenuItemName(name);
}

// CREATE
async function create(data) {
  ensureLoaded();
  const recipe = {
    id: data.id || uuid(),
    menuItemName: data.menuItemName || data.menu_item_name || "",
    area: data.area || "cucina",
    ingredients: Array.isArray(data.ingredients)
      ? data.ingredients.map((i) => ({
          name: i.name || "",
          quantity: Number(i.quantity) ?? Number(i.qty) ?? 0,
          unit: i.unit || "",
          unitCost: Number(i.unitCost) ?? 0,
        }))
      : [],
    note: data.note || "",
  };

  recipes.push(recipe);
  writeRecipes(recipes);
  return recipe;
}

// UPDATE
async function update(id, data) {
  ensureLoaded();
  const recipe = recipes.find((r) => r.id === id);
  if (!recipe) return null;

  if (data.menuItemName !== undefined) recipe.menuItemName = data.menuItemName;
  if (data.area !== undefined) recipe.area = data.area;
  if (data.note !== undefined) recipe.note = data.note;

  if (Array.isArray(data.ingredients)) {
    recipe.ingredients = data.ingredients.map((i) => ({
      name: i.name || "",
      quantity: Number(i.quantity) ?? Number(i.qty) ?? 0,
      unit: i.unit || "",
      unitCost: Number(i.unitCost) ?? 0,
    }));
  }

  writeRecipes(recipes);
  return recipe;
}

// DELETE
async function remove(id) {
  ensureLoaded();
  const index = recipes.findIndex((r) => r.id === id);
  if (index === -1) return false;

  recipes.splice(index, 1);
  writeRecipes(recipes);
  return true;
}

module.exports = {
  getAll,
  getById,
  getByMenuItemName,
  findRecipeByMenuItemName,
  create,
  update,
  remove,
  readRecipes,
};
