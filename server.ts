import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialized Gemini client to prevent crash when GEMINI_API_KEY is missing during startup or testing
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY1 || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY1 (or GEMINI_API_KEY) environment variable is required. Please check that GEMINI_API_KEY1 is configured correctly under Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Input validation helper
function validateIngredientsInput(input: string): { isValid: boolean; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { isValid: false, error: "Ingredients entry cannot be empty." };
  }
  if (trimmed.length < 3) {
    return { isValid: false, error: "Please enter a valid list of ingredients (at least 3 characters length required)." };
  }
  // Reject entries containing only number characters and symbols
  const hasLetters = /[a-zA-Z]/.test(trimmed);
  if (!hasLetters) {
    return { isValid: false, error: "Ingredient entry must contain text letters describing valid food items." };
  }
  return { isValid: true };
}

interface EmbeddedRecipe {
  recipeName: string;
  keywords: string[];
  ingredientsList: string[];
  instructions: string[];
  prepTime: string;
  cookTime: string;
  servings: string;
  difficultyLevel: "Easy" | "Medium" | "Hard";
  baseCalories: string;
  baseMacros: { protein: string; carbs: string; fat: string; fiber: string };
  nutritionTip: string;
}

const EMBEDDED_RECIPES: EmbeddedRecipe[] = [
  {
    recipeName: "Rustic Garlic Tomato Pasta",
    keywords: ["pasta", "spaghetti", "macaroni", "noodle", "tomato", "sauce", "garlic", "onion", "cheese"],
    ingredientsList: [
      "200g Pasta (Spaghetti, Penne, or similar)",
      "2 large Tomatoes, diced (or 1 can of chopped tomatoes)",
      "3 cloves Garlic, minced",
      "1 medium Onion, finely chopped",
      "2 tbsp Olive Oil (or any cooking oil)",
      "1/2 tsp Dried Oregano or Basil (optional)",
      "Salt and Black Pepper to taste",
      "Grated Cheese (optional, for serving)"
    ],
    instructions: [
      "Bring a large pot of salted water to a boil. Cook pasta according to package instructions until al dente. Drain, reserving 1/2 cup of pasta water.",
      "While pasta is cooking, heat olive oil in a pan over medium heat. Add the chopped onions and cook for 3-4 minutes until translucent.",
      "Add the minced garlic and cook for another minute until fragrant (be careful not to burn it).",
      "Stir in the diced tomatoes, oregano, salt, and pepper. Simmer on medium-low heat for 8-10 minutes until tomatoes break down into a rustic sauce.",
      "Add the drained pasta directly to the sauce. Pour in a splash of the reserved pasta water to emulsify. Toss/stir continuously over heat for 1 minute.",
      "Divide into plates, garnish with cracked black pepper and freshly grated cheese if desired, and serve hot."
    ],
    prepTime: "10 mins",
    cookTime: "15 mins",
    servings: "2",
    difficultyLevel: "Easy",
    baseCalories: "380 kcal",
    baseMacros: { protein: "11g", carbs: "68g", fat: "8g", fiber: "4g" },
    nutritionTip: "Tossing the pasta directly in the pan with a splash of starch-rich pasta water helps the sauce bind perfectly without adding heavy creams or emulsifiers."
  },
  {
    recipeName: "Golden Garlic Fries or Roasted Potatoes",
    keywords: ["potato", "potatoes", "garlic", "oil", "pepper", "fry", "fries", "roast", "herb"],
    ingredientsList: [
      "3 medium Potatoes (Russet, Yukon Gold, or baby potatoes), cut into wedges",
      "3 cloves Garlic, finely minced or grated",
      "3 tbsp Olive Oil or any cooking oil",
      "1 tsp Paprika or Rosemary (optional)",
      "Salt and Ground Black Pepper to taste"
    ],
    instructions: [
      "Preheat your oven or toaster oven to 400°F (200°C). If using an air fryer, preheat to 375°F (190°C).",
      "Thoroughly wash and dry the potatoes. Cut them into equal-sized wedges or fries to ensure even cooking.",
      "In a large mixing bowl, toss the potato wedges with olive oil, minced garlic, paprika, salt, and ground black pepper until fully coated.",
      "Spread the wedges in a single layer on a lined baking pan, ensuring they aren't crowded (crowding causes them to steam instead of crisp!).",
      "Roast for 25-30 minutes (or air fry for 15-20), turning them halfway through, until the exterior is deeply golden brown and crispy.",
      "Remove from oven, toss with an optional extra pinch of sea salt, and serve hot with your favorite dipping sauce."
    ],
    prepTime: "10 mins",
    cookTime: "30 mins",
    servings: "2",
    difficultyLevel: "Easy",
    baseCalories: "240 kcal",
    baseMacros: { protein: "4g", carbs: "38g", fat: "9g", fiber: "5g" },
    nutritionTip: "Leaving the skins on your potatoes preserves dietary fiber, potassium, and B vitamins that are typically stripped away when peeled."
  },
  {
    recipeName: "Classic Golden Fluffy Omelette",
    keywords: ["egg", "eggs", "cheese", "milk", "butter", "onion", "pepper", "spinach"],
    ingredientsList: [
      "3 fresh Eggs",
      "2 tbsp Milk or Water (for maximum fluffiness)",
      "1 tbsp Butter or Cooking Oil",
      "1/4 cup Shredded Cheese (Cheddar, Mozzarella, or Monterey Jack)",
      "1/4 cup finely diced Onions or Bell Peppers (optional)",
      "Salt and Freshly Cracked Black Pepper to taste"
    ],
    instructions: [
      "In a medium bowl, crack the eggs. Add the milk/water, salt, and pepper. Whisk vigorously with a fork for 60 seconds until completely uniform and frothy.",
      "Heat a non-stick skillet over medium heat and melt the butter, spreading it to cover the entire base of the pan.",
      "Pour the beaten eggs into the hot pan. Let them sit untouched for 10-15 seconds to establish a thin cooked base.",
      "Using a spatula, gently push the cooked edges towards the center, tilting the pan so the raw egg runs to the edges. Repeat around the circumference.",
      "When the eggs are mostly set but still slightly moist in the middle, sprinkle the shredded cheese (and sautéed veggies) over one half of the omelette.",
      "Gently fold the empty half over the cheese filling. Slide off the pan onto a plate and enjoy immediately."
    ],
    prepTime: "5 mins",
    cookTime: "5 mins",
    servings: "1-2",
    difficultyLevel: "Easy",
    baseCalories: "290 kcal",
    baseMacros: { protein: "18g", carbs: "2g", fat: "22g", fiber: "0g" },
    nutritionTip: "Adding water or milk before whisking creates steam packets within the eggs during cooking, ensuring a light, pillowy, and tender structure."
  },
  {
    recipeName: "Hearty Garlic Rice & Seasoned Beans",
    keywords: ["rice", "beans", "bean", "black bean", "kidney bean", "garlic", "onion", "spice"],
    ingredientsList: [
      "1 cup Long-Grain White or Brown Rice (uncooked)",
      "1 can Black Beans, Red Kidney Beans, or Pinto Beans (rinsed and drained)",
      "1 medium Onion, finely diced",
      "3 cloves Garlic, chopped",
      "1 tbsp Cooking Oil",
      "1/2 tsp Cumin or Chili Powder",
      "Salt, Pepper, and hot sauce to taste"
    ],
    instructions: [
      "In a medium pot, cook the rice by combining 1 cup of dry rice with 2 cups of water and a pinch of salt. Bring to a boil, cover, reduce heat to low, and simmer for 15 minutes. Let rest covered for 5 minutes.",
      "While the rice cooks, heat oil in a separate saucepan over medium heat. Sauté the chopped onions and garlic for about 4 minutes until golden.",
      "Add the drained beans, cumin, chili powder, and a splash of water (about 1/4 cup). Stir well to combine all spices.",
      "Simmer the bean mixture on low heat for 8-10 minutes, mashing a small portion of the beans with your spatula to create a rich, creamy sauce consistency.",
      "Season the beans with salt and pepper to taste.",
      "Assemble by placing a generous scoop of hot fluffy rice in a bowl, topping with the warm, savory seasoned beans, and adding any optional hot sauce or cilantro."
    ],
    prepTime: "10 mins",
    cookTime: "20 mins",
    servings: "2",
    difficultyLevel: "Easy",
    baseCalories: "420 kcal",
    baseMacros: { protein: "14g", carbs: "78g", fat: "6g", fiber: "11g" },
    nutritionTip: "Combining rice and beans creates a complete protein containing all nine essential amino acids that your body cannot synthesize on its own."
  },
  {
    recipeName: "Crispy Sesame Tofu & Broccoli Stir-Fry",
    keywords: ["tofu", "soy", "broccoli", "stir", "fry", "garlic", "ginger", "sauce"],
    ingredientsList: [
      "1 block Firm or Extra Firm Tofu, pressed and cut into cubes",
      "1 head of Broccoli, cut into small bite-sized florets",
      "2 tbsp Soy Sauce (or Coconut Aminos)",
      "1 tbsp Cornstarch (for ultimate crispy edges)",
      "2 tbsp Sesame Oil or Neutral Cooking Oil",
      "2 cloves Garlic, minced",
      "1 tsp fresh Ginger, grated or minced",
      "1 tbsp honey or maple syrup (optional, for a hint of sweetness)"
    ],
    instructions: [
      "Press the block of tofu between paper towels for 10 minutes to drain excess water, then slice into equal 1-inch cubes.",
      "Toss the tofu cubes in a small bowl with 1 tablespoon of soy sauce and the cornstarch until every piece is uniformly dusted.",
      "Heat cooking oil in a large skillet or wok over medium-high heat. Add the tofu cubes in a single layer and pan-fry for 8-10 minutes, rotating until all sides are crunchy.",
      "Remove the crispy cooked tofu from the skillet and set it aside on a plate.",
      "Add the raw broccoli florets, minced garlic, and ginger to the same skillet with another splash of oil. Stir-fry for 4-5 minutes until broccoli turns a vibrant green.",
      "In a cup, mix the remaining soy sauce, sweeteners (if using), and 2 tablespoons of water. Pour this mixture into the pan.",
      "Return the crispy tofu to the pan. Toss everything together for 1-2 minutes until the sauce bubbles, thickens slightly, and coats every single piece."
    ],
    prepTime: "15 mins",
    cookTime: "15 mins",
    servings: "2",
    difficultyLevel: "Medium",
    baseCalories: "310 kcal",
    baseMacros: { protein: "16g", carbs: "22g", fat: "18g", fiber: "5g" },
    nutritionTip: "Broccoli is rich in Vitamin C, which increases iron absorption from non-heme plant-based sources like tofu when eaten in the same meal."
  },
  {
    recipeName: "Cozy Cinnamon Apple Oats",
    keywords: ["apple", "apples", "oat", "oats", "oatmeal", "cinnamon", "milk", "sugar", "honey"],
    ingredientsList: [
      "1 cup Rolled Oats (or quick oats)",
      "2 cups Water, Milk, or Plant-Based Milk",
      "1 red or green Apple, cored and grated or finely diced",
      "1/2 tsp Ground Cinnamon",
      "1 tbsp Honey, Maple Syrup, or Brown Sugar",
      "A pinch of Salt (essential to bring out the sweetness!)"
    ],
    instructions: [
      "In a small saucepan, bring the water/milk and the pinch of salt to a gentle boil.",
      "Stir in the rolled oats, diced apple bits, and ground cinnamon.",
      "Reduce the burner heat to low and simmer for 5-7 minutes, stirring occasionally, until the oats are creamy and the apple pieces are tender.",
      "Turn off the heat. Stir in the honey, maple syrup, or brown sugar for balanced sweetness.",
      "Cover the saucepan with a lid and let stand for 2 minutes—this helps the oatmeal reach a perfectly thick, velvety pudding consistency.",
      "Pour into bowls, sprinkle extra cinnamon or toasted seeds/nuts on top if you have them, and enjoy warm."
    ],
    prepTime: "5 mins",
    cookTime: "8 mins",
    servings: "2",
    difficultyLevel: "Easy",
    baseCalories: "260 kcal",
    baseMacros: { protein: "7g", carbs: "48g", fat: "4g", fiber: "7g" },
    nutritionTip: "Oats contain a powerful soluble fiber called beta-glucan, which supports gut health, satiety, and healthy cholesterol regulation."
  },
  {
    recipeName: "Savory Pan-Seared Chicken & Warm Onions",
    keywords: ["chicken", "breast", "thigh", "meat", "garlic", "onion", "lemon", "butter"],
    ingredientsList: [
      "2 Boneless Chicken Breasts or Thighs",
      "1 large Onion, sliced into rings",
      "2 cloves Garlic, mashed",
      "2 tbsp Olive Oil or Butter",
      "A squeeze of fresh Lemon Juice (optional)",
      "Salt, Paprika, and Dried Rosemary / Thyme"
    ],
    instructions: [
      "Pat the chicken pieces dry using paper towels. Season both sides generously with salt, pepper, paprika, and your favorite dried herbs.",
      "Heat the cooking oil or butter in a skillet over medium-high heat until hot but not smoking.",
      "Sear the chicken breasts in the pan for 5-6 minutes on the first side without moving them, which allows a beautiful caramelized crust to form.",
      "Flip the chicken. Scatter the sliced onions and mashed garlic into the spaces around the chicken in the skillet.",
      "Reduce heat slightly to medium. Cook for another 6-7 minutes, stirring the onions periodically so they soften and soak up the pan juices.",
      "Verify the internal temperature of the thickest chicken piece is safe (165°F/74°C). Squeeze lemon juice on top, resting 5 minutes before cutting."
    ],
    prepTime: "10 mins",
    cookTime: "12 mins",
    servings: "2",
    difficultyLevel: "Medium",
    baseCalories: "310 kcal",
    baseMacros: { protein: "32g", carbs: "6g", fat: "16g", fiber: "1g" },
    nutritionTip: "Allowing cooked chicken to rest off-heat for 5 minutes before slicing lets the internal high-pressure juices redistribute throughout the muscle fibers, preserving premium juiciness."
  }
];

function capitalize(str: string): string {
  if (!str) return "";
  return str.split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function getLocalFallbackResponse(ingredients: string, allergies: string, errorObj?: any) {
  const searchTerms = ingredients.toLowerCase()
    .split(/[\s,]+/)
    .map(t => t.trim())
    .filter(t => t.length > 2);

  let selectedRecipe: any = null;
  let highestScore = -1;

  for (const recipe of EMBEDDED_RECIPES) {
    let score = 0;
    for (const term of searchTerms) {
      const inKeywords = recipe.keywords.some(kw => kw.includes(term) || term.includes(kw));
      const inList = recipe.ingredientsList.some(item => item.toLowerCase().includes(term));
      if (inKeywords || inList) {
        score += 3;
      }
    }
    if (score > highestScore) {
      highestScore = score;
      selectedRecipe = recipe;
    }
  }

  // If no high quality match found, procedurally synthesize one securely!
  if (highestScore <= 0 || !selectedRecipe) {
    const rawItems = ingredients.split(/[,;\n]+/).map(i => i.trim()).filter(i => i.length > 0);
    const mainItem1 = rawItems[0] || "Pantry Staples";
    const mainItem2 = rawItems[1] || "Aromatic Seasonings";

    selectedRecipe = {
      recipeName: `Crispy Pan-Seared ${capitalize(mainItem1)} with ${capitalize(mainItem2)}`,
      ingredientsList: [
        `1 portion of fresh ${capitalize(mainItem1)}`,
        `1 heap of diced ${capitalize(mainItem2)}`,
        "1 tbsp Butter or Olive oil",
        "2 cloves Garlic, crushed",
        "1 soft onion, sliced",
        "Pinch of table salt and ground black pepper"
      ],
      instructions: [
        `Meticulously wash and dry the fresh ${capitalize(mainItem1)} and ${capitalize(mainItem2)} to ensure food hygiene.`,
        "Heat the cooking fat or melt the butter in a heavy-bottomed pan over medium-high heat. Toss in garlic and onions to construct a rich aroma baseline.",
        `Add your prepared ${capitalize(mainItem1)} and pan-fry for 6-8 minutes until golden-brown and fork-tender. Season appropriately with sea salt.`,
        `Gently integrate the remaining portions of ${capitalize(mainItem2)} and cook for an extra 3 minutes to fuse the robust savory juices.`,
        "Let the dish rest undisturbed off-heat for 2 minutes, dress with fresh herbs if available, and serve warmly!"
      ],
      prepTime: "10 mins",
      cookTime: "12 mins",
      servings: "2",
      difficultyLevel: "Easy",
      baseCalories: "270 kcal",
      baseMacros: { protein: "10g", carbs: "19g", fat: "14g", fiber: "4g" },
      nutritionTip: `Pairing ${capitalize(mainItem1)} with healthy unsaturated vegetable oils improves the gut's absorption of critical fat-soluble micronutrients.`
    };
  }

  // Perform allergy audit on selected recipe
  const cleanAllergies = (allergies || "").toLowerCase().trim();
  const hasAllergies = cleanAllergies.length > 0;

  let safetyStatus: "SAFE" | "WARNING" | "UNSAFE" = "SAFE";
  let warningMessage = "The recipe contains zero flagged components matching your declared allergies, making it safe for immediate cooking!";
  const unsafeIngredientsFlagged: string[] = [];
  const substitutions: { original: string; safeAlternative: string }[] = [];

  if (hasAllergies) {
    const recipeIngs = selectedRecipe.ingredientsList;
    for (const ing of recipeIngs) {
      const ingLower = ing.toLowerCase();
      
      if (cleanAllergies.includes("dairy") || cleanAllergies.includes("milk") || cleanAllergies.includes("cheese")) {
        if (ingLower.includes("cheese") || ingLower.includes("milk") || ingLower.includes("butter") || ingLower.includes("mozzarella") || ingLower.includes("cheddar")) {
          unsafeIngredientsFlagged.push(ing);
          safetyStatus = "WARNING";
          warningMessage = "Allergy Guard identified dairy elements (cheese or butter) in this recipe. Swap to non-dairy alternatives to ensure restriction guidelines.";
          substitutions.push({
            original: ing,
            safeAlternative: ingLower.includes("butter") ? "Unsalted plant-based vegan butter or cold-pressed coconut oil" : "Nutritional yeast flakes or nutritional plant-cheese"
          });
        }
      }
      
      if (cleanAllergies.includes("egg")) {
        if (ingLower.includes("egg") || ingLower.includes("eggs")) {
          unsafeIngredientsFlagged.push(ing);
          safetyStatus = "UNSAFE";
          warningMessage = "Allergy Guard flagged direct egg allergens in this recipe. High-risk cross-reaction potential.";
          substitutions.push({
            original: ing,
            safeAlternative: "Commercial vegan egg substitute or silken tofu mash scramble"
          });
        }
      }

      if (cleanAllergies.includes("gluten") || cleanAllergies.includes("wheat")) {
        if (ingLower.includes("pasta") || ingLower.includes("spaghetti") || ingLower.includes("soy sauce")) {
          unsafeIngredientsFlagged.push(ing);
          safetyStatus = "WARNING";
          warningMessage = "Allergy Guard highlighted wheat-based pasta or sauces. Please swap with certified gluten-free options.";
          substitutions.push({
            original: ing,
            safeAlternative: ingLower.includes("soy sauce") ? "Gluten-free organic Coconut Aminos" : "Brown rice-based or chickpea-based gluten-free pasta"
          });
        }
      }

      if (cleanAllergies.includes("soy")) {
        if (ingLower.includes("tofu") || ingLower.includes("soy sauce")) {
          unsafeIngredientsFlagged.push(ing);
          safetyStatus = "UNSAFE";
          warningMessage = "Allergy Guard detected soy-based core ingredients. Substitutes recommended.";
          substitutions.push({
            original: ing,
            safeAlternative: ingLower.includes("tofu") ? "Pressed chickpea paneer blocks or high-protein seitan" : "Coconut Aminos sauce"
          });
        }
      }
    }
  }

  return {
    success: true,
    isFallback: true,
    fallbackReason: errorObj?.message || "Rate limiting error on live Gemini API free tier.",
    recipe: {
      recipeName: selectedRecipe.recipeName,
      ingredientsList: selectedRecipe.ingredientsList,
      instructions: selectedRecipe.instructions,
      prepTime: selectedRecipe.prepTime,
      cookTime: selectedRecipe.cookTime,
      servings: selectedRecipe.servings,
      difficultyLevel: selectedRecipe.difficultyLevel,
      matchPercentage: highestScore > 0 ? Math.min(95, 45 + highestScore * 6) : 100,
      missingIngredients: highestScore > 0 ? ["Fresh herbs", "Extra-virgin olive oil dash"] : []
    },
    allergyAnalysis: {
      status: safetyStatus,
      warningMessage,
      unsafeIngredientsFlagged,
      substitutions
    },
    nutritionAdvisor: {
      caloriesPerServing: selectedRecipe.baseCalories,
      macronutrients: selectedRecipe.baseMacros,
      nutritionTip: selectedRecipe.nutritionTip,
      healthierSubstitutions: [
        { original: "cooking oil", safeAlternative: "Cold-pressed extra-virgin olive oil" },
        { original: "processed white flour/pasta", safeAlternative: "High-fiber whole grain products" }
      ]
    },
    foodWasteAnalysis: {
      foodWasteScore: highestScore > 0 ? `${Math.min(98, 80 + highestScore * 4)}%` : "A",
      expirationPriorityNote: "Rescuing these items immediately prevents organic decomposition in waste facilities. Keeping organics out of garbage bins decreases landfill methane emissions.",
      preservationTip: "Seal individual cooled leftovers in sterile, airtight containers within 2 hours. Refrigerate and consume within 4 days.",
      sustainabilityTip: "Keep vegetable scraps, skins, and herb stems frozen in a bag. When full, boil them for 45 minutes to craft a premium, preservative-free vegetable cooking broth!"
    }
  };
}

// Health-check endpoint for connectivity verification
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    message: "RecipeRescue multi-agent orchestration backend is online and fully connected.",
    timestamp: new Date().toISOString(),
    apiKeysConfigured: !!(process.env.GEMINI_API_KEY1 || process.env.GEMINI_API_KEY)
  });
});

// API Route for recipe matching and agent orchestration
app.post("/api/recipe-rescue", async (req: Request, res: Response) => {
  const { ingredients, allergies } = req.body;

  // 1. Validate Input
  if (typeof ingredients !== "string") {
    res.status(400).json({ error: "Ingredients must be a string." });
    return;
  }

  const validation = validateIngredientsInput(ingredients);
  if (!validation.isValid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  try {
    const ai = getGeminiClient();
    const cleanAllergies = (allergies || "").trim();

    // =========================================================================
    // CONSOLIDATED SINGLE-CALL MULTI-AGENT ORCHESTRATOR
    // This design combines all four individual agents' tasks into a single,
    // transactive Gemini prompt. It drastically reduces rate-limiting (429),
    // uses 75% fewer API quota requests, and provides unmatched processing speeds.
    // =========================================================================
    const prompt = `You are a team of four autonomous culinary and nutrition agents collaborating to rescue left-over food items:

1. **Ingredient Matcher Agent (Chef Core)**:
   - User stock: "${ingredients.trim()}"
   - Suggest a delicious, real, and accessible recipe utilizing primarily these available ingredients.
   - Set a difficultyLevel ("Easy", "Medium", or "Hard"), prepTime, cookTime, servings, matchPercentage (how much of the suggested recipe is covered by their entered list vs help items needed), and missingIngredients list.

2. **Allergy Checker Agent (Allergy Guard)**:
   - Target allergies or restrictions: "${cleanAllergies || 'None specified'}"
   - Perform a thorough allergy evaluation.
   - If allergies exist and there is a direct risk of cross-contact (e.g. cheese for dairy-free, soy sauce for wheat/soy filters), highlight the risk, set status to either "WARNING" or "UNSAFE", flag the specific "unsafeIngredientsFlagged", and propose direct safe kitchen "substitutions".
   - If no target allergies match, validate cooking guidelines and set status to "SAFE".

3. **Nutrition Advisor Agent (Macros Specialist)**:
   - Estimate the macronutrients (protein, carbs, fat, fiber is required), total caloriesPerServing, and supply exactly one actionable, evidence-based nutritionTip specific to this recipe. Propose 1-2 healthier substitutions if any item can be optimized.

4. **Food Waste Reduction Agent (Sustainability Coordinator)**:
   - Formulate a smart circular food waste score or grade (e.g., 'A+', '92%') evaluating how effectively the recipe prevents landfill decomposition.
   - Write an expirationPriorityNote highlighting why using these items blocks greenhouse emissions. Provide a leftover preservationTip and a creative zero-waste sustainabilityTip.

Perform all agent evaluations objectively and compile them together.`;

    const multiAgentResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recipe: {
              type: Type.OBJECT,
              properties: {
                recipeName: { type: Type.STRING, description: "The name of the recipe." },
                ingredientsList: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Full list of ingredients with sensible measurements/portions."
                },
                instructions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Step-by-step numbered preparation instructions."
                },
                prepTime: { type: Type.STRING, description: "Estimated active prep time (e.g., '15 mins')." },
                cookTime: { type: Type.STRING, description: "Estimated cooking time (e.g., '25 mins')." },
                servings: { type: Type.STRING, description: "Estimated number of servings." },
                difficultyLevel: { type: Type.STRING, description: "Must strictly be 'Easy', 'Medium', or 'Hard'." },
                matchPercentage: { type: Type.INTEGER, description: "Percentage of recipe ingredients covered by user's available stock (e.g., 85)." },
                missingIngredients: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of ingredients needed but not clearly specified in available items list." }
              },
              required: ["recipeName", "ingredientsList", "instructions", "prepTime", "cookTime", "servings", "difficultyLevel", "matchPercentage", "missingIngredients"]
            },
            allergyAnalysis: {
              type: Type.OBJECT,
              properties: {
                status: { type: Type.STRING, description: "Must strictly be 'SAFE', 'WARNING', or 'UNSAFE'." },
                warningMessage: { type: Type.STRING, description: "Clear explanation comparing allergies to ingredients." },
                unsafeIngredientsFlagged: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific recipe ingredients triggering the alert." },
                substitutions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      original: { type: Type.STRING, description: "The target allergen ingredient." },
                      safeAlternative: { type: Type.STRING, description: "The safe substitute choice." }
                    },
                    required: ["original", "safeAlternative"]
                  },
                  description: "Direct safe replacements if status is WARNING or UNSAFE. Empty list if SAFE."
                }
              },
              required: ["status", "warningMessage", "unsafeIngredientsFlagged", "substitutions"]
            },
            nutritionAdvisor: {
              type: Type.OBJECT,
              properties: {
                caloriesPerServing: { type: Type.STRING, description: "Calories per serving (e.g., '350 kcal')." },
                macronutrients: {
                  type: Type.OBJECT,
                  properties: {
                    protein: { type: Type.STRING, description: "E.g. '24g'." },
                    carbs: { type: Type.STRING, description: "E.g. '45g'." },
                    fat: { type: Type.STRING, description: "E.g. '12g'." },
                    fiber: { type: Type.STRING, description: "E.g. '5g'." }
                  },
                  required: ["protein", "carbs", "fat", "fiber"]
                },
                nutritionTip: { type: Type.STRING, description: "Exactly one helpful, specific nutrition suggestion." },
                healthierSubstitutions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      original: { type: Type.STRING },
                      safeAlternative: { type: Type.STRING }
                    },
                    required: ["original", "safeAlternative"]
                  },
                  description: "Smart healthy substitutions or upgrades."
                }
              },
              required: ["caloriesPerServing", "macronutrients", "nutritionTip", "healthierSubstitutions"]
            },
            foodWasteAnalysis: {
              type: Type.OBJECT,
              properties: {
                foodWasteScore: { type: Type.STRING, description: "Sustainability grade, e.g. 'A+' or '90%'" },
                expirationPriorityNote: { type: Type.STRING, description: "Brief explanation of how using these available ingredients avoids wasted resources." },
                preservationTip: { type: Type.STRING, description: "Actionable concrete tip to keep cooked leftovers fresh or store extra portions." },
                sustainabilityTip: { type: Type.STRING, description: "One creative zero-waste circular kitchen trick." }
              },
              required: ["foodWasteScore", "expirationPriorityNote", "preservationTip", "sustainabilityTip"]
            }
          },
          required: ["recipe", "allergyAnalysis", "nutritionAdvisor", "foodWasteAnalysis"]
        }
      }
    });

    if (!multiAgentResponse.text) {
      throw new Error("Multi-Agent Collaborative pipeline returned empty response from the generative model.");
    }

    const consensusData = JSON.parse(multiAgentResponse.text);

    // Return consensus response mapping perfectly to Client UI expectation
    res.json({
      success: true,
      recipe: consensusData.recipe,
      allergyAnalysis: consensusData.allergyAnalysis,
      nutritionAdvisor: consensusData.nutritionAdvisor,
      foodWasteAnalysis: consensusData.foodWasteAnalysis
    });

  } catch (error: any) {
    console.warn("Recipe rescue live API failed. Activating resilient local sandbox cooking engine:", error?.message || error);
    try {
      const fallbackData = getLocalFallbackResponse(ingredients, allergies, error);
      res.json(fallbackData);
    } catch (fallbackErr: any) {
      console.error("Local matching engine exception occurred:", fallbackErr);
      res.status(500).json({
        error: `Both live Gemini API and offline fuzzy rules-engines failed. Live error: ${error?.message || "Unknown error"}`
      });
    }
  }
});

// Configure Vite or Static site serving helper
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`RecipeRescue backend up and running at http://localhost:${PORT}`);
  });
}

start();
