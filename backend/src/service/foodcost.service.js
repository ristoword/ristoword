function calculateIngredientCost(ingredient = {}) {
  const unitCost = Number(ingredient.unitCost) || 0;
  const quantity = Number(ingredient.quantity) || 0;
  return unitCost * quantity;
}

function calculateRecipeCost(ingredients = []) {
  return ingredients.reduce((acc, ingredient) => {
    return acc + calculateIngredientCost(ingredient);
  }, 0);
}

function calculateFoodCostPercent(recipeCost = 0, sellingPrice = 0) {
  const price = Number(sellingPrice) || 0;
  if (price <= 0) return 0;
  return (Number(recipeCost) / price) * 100;
}

function calculateSuggestedPrice(recipeCost = 0, targetMarginPercent = 35) {
  const margin = Number(targetMarginPercent) || 35;
  const divisor = 1 - margin / 100;
  if (divisor <= 0) return 0;
  return Number(recipeCost) / divisor;
}

function analyzeDish({ ingredients = [], sellingPrice = 0, targetMarginPercent = 35 } = {}) {
  const recipeCost = calculateRecipeCost(ingredients);
  const foodCostPercent = calculateFoodCostPercent(recipeCost, sellingPrice);
  const suggestedPrice = calculateSuggestedPrice(recipeCost, targetMarginPercent);

  return {
    recipeCost,
    sellingPrice: Number(sellingPrice) || 0,
    foodCostPercent,
    suggestedPrice,
    targetMarginPercent: Number(targetMarginPercent) || 35
  };
}

module.exports = {
  calculateIngredientCost,
  calculateRecipeCost,
  calculateFoodCostPercent,
  calculateSuggestedPrice,
  analyzeDish
};