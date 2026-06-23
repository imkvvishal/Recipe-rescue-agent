export interface Recipe {
  recipeName: string;
  ingredientsList: string[];
  instructions: string[];
  prepTime: string;
  cookTime: string;
  servings: string;
  difficultyLevel: "Easy" | "Medium" | "Hard";
  matchPercentage: number;
  missingIngredients: string[];
}

export interface Substitution {
  original: string;
  safeAlternative: string;
}

export interface AllergyAnalysis {
  status: "SAFE" | "WARNING" | "UNSAFE";
  warningMessage: string;
  substitutions: Substitution[];
  unsafeIngredientsFlagged: string[];
}

export interface Macronutrients {
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
}

export interface NutritionAdvisor {
  caloriesPerServing: string;
  macronutrients: Macronutrients;
  nutritionTip: string;
  healthierSubstitutions: Substitution[];
}

export interface FoodWasteAnalysis {
  foodWasteScore: string; // e.g. "A+", "95%"
  expirationPriorityNote: string;
  preservationTip: string;
  sustainabilityTip: string;
}

export interface RecipeRescueResponse {
  success: boolean;
  isFallback?: boolean;
  fallbackReason?: string;
  recipe: Recipe;
  allergyAnalysis: AllergyAnalysis;
  nutritionAdvisor: NutritionAdvisor;
  foodWasteAnalysis: FoodWasteAnalysis;
  error?: string;
}
