const recipesRepository = require("../repositories/recipes.repository");

// GET /api/recipes
exports.listRecipes = async (req, res) => {
  const data = await recipesRepository.getAll();
  res.json(data);
};

// GET /api/recipes/:id
exports.getRecipeById = async (req, res) => {
  const recipe = await recipesRepository.getById(req.params.id);

  if (!recipe) {
    return res.status(404).json({ error: "Ricetta non trovata" });
  }

  res.json(recipe);
};

// POST /api/recipes
exports.createRecipe = async (req, res) => {
  const recipe = await recipesRepository.create(req.body || {});
  res.status(201).json(recipe);
};

// PATCH /api/recipes/:id
exports.updateRecipe = async (req, res) => {
  const recipe = await recipesRepository.update(req.params.id, req.body || {});

  if (!recipe) {
    return res.status(404).json({ error: "Ricetta non trovata" });
  }

  res.json(recipe);
};

// DELETE /api/recipes/:id
exports.deleteRecipe = async (req, res) => {
  const ok = await recipesRepository.remove(req.params.id);

  if (!ok) {
    return res.status(404).json({ error: "Ricetta non trovata" });
  }

  res.json({ success: true });
};