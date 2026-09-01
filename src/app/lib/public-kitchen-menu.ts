type PublicKitchenCategory =
  | "salad" | "soup" | "snacks" | "beef" | "fish" | "pork" | "local-food"
  | "pizza" | "burger" | "sandwich" | "pasta" | "dessert" | "drinks";

export type PublicKitchenMenuSeedItem = {
  id: string;
  name: string;
  price: number;
  category: PublicKitchenCategory;
  description: string;
  prepMinutes: number;
  updatedAt: number;
};

const item = (
  id: string,
  name: string,
  price: number,
  category: PublicKitchenCategory,
  description: string,
  prepMinutes = 25,
): PublicKitchenMenuSeedItem => ({ id, name, price, category, description, prepMinutes, updatedAt: 1 });

export const PUBLIC_KITCHEN_MENU: PublicKitchenMenuSeedItem[] = [
  item("kitchen-tomato-soup", "Tomato Soup", 10000, "soup", "Roux, Prestige, tomato sauce and black pepper", 15),
  item("kitchen-pumpkin-soup", "Pumpkin Soup", 10000, "soup", "Butternut squash, coriander, boiled potatoes and black pepper", 15),
  item("kitchen-vegetable-soup", "Vegetable Soup", 10000, "soup", "Carrots, cauliflower, broccoli and green beans", 15),
  item("kitchen-cream-mushroom-soup", "Cream of Mushroom Soup", 10000, "soup", "Chopped mushroom, roux, Prestige cooking cream and black pepper", 15),
  item("kitchen-cream-chicken-soup", "Cream Chicken Soup", 10000, "soup", "Chopped chicken, roux, chicken stock, cooking cream, chicken cubes and butter", 18),
  item("kitchen-vegetable-salad", "Vegetable Salad", 15000, "salad", "Cucumber, tomatoes, mayonnaise, lettuce, broccoli, cauliflower, onions and olive oil", 15),
  item("kitchen-avocado-salad", "Avocado Salad", 12000, "salad", "Avocado cubes, lettuce, olive oil and black pepper with passion dressing", 15),
  item("kitchen-green-salad", "Green Salad", 10000, "salad", "Cucumber, onions, tomato, lettuce, Caesar dressing, mayonnaise and mustard", 15),
  item("kitchen-chicken-salad", "Chicken Salad", 15000, "salad", "Chicken cubes, lettuce, mayonnaise, black pepper dressing and olive oil", 20),
  item("kitchen-chicken-caesar-salad", "Chicken Caesar Salad", 15000, "salad", "Chicken cubes, lettuce, mayonnaise, bread cubes, black pepper dressing and olive oil", 20),
  item("kitchen-kuku-paka", "Kuku Paka", 25000, "local-food", "Chicken, chopped onions, green peas, coconut cream and coriander"),
  item("kitchen-beef-stew", "Beef Stew", 20000, "beef", "Beef cubes, chopped onions, potatoes, vegetables and cooking cream"),
  item("kitchen-roasted-beef", "Roasted Beef", 20000, "beef", "Beef cubes, carrots, green pepper, onions, leeks and oyster sauce"),
  item("kitchen-roasted-lamb", "Roasted Lamb", 25000, "local-food", "Lamb, onions, bell pepper, carrots and oyster sauce"),
  item("kitchen-beef-fillet", "Beef Fillet", 25000, "beef", "Grilled beef fillet with oyster sauce, steamed vegetables and mushroom sauce"),
  item("kitchen-grilled-chicken", "Grilled Chicken", 20000, "local-food", "Grilled chicken with oyster sauce, light soy sauce, mushroom sauce and vegetables"),
  item("kitchen-fish-fillet", "Fish Fillet", 30000, "fish", "Grilled fish fillet with lemon, potato medley and roasted spinach"),
  item("kitchen-coconut-tilapia", "Coconut Tilapia", 30000, "fish", "Fried tilapia with coconut sauce and lemon"),
  item("kitchen-grilled-fish-skewers", "Grilled Fish Skewers", 25000, "fish", "Fish cubes, onions, carrots and green pepper with sautéed vegetables"),
  item("kitchen-pepper-steak", "Pepper Steak", 25000, "beef", "Grilled beef steak with oyster and pepper sauce, served with French fries"),
  item("kitchen-chicken-schnitzel", "Chicken Schnitzel", 20000, "local-food", "Grilled chicken breast with mashed potatoes and steamed vegetables"),
  item("kitchen-chicken-burger", "Chicken Burger", 20000, "burger", "Chicken patty, lettuce, onion, tomato and mayonnaise with French fries"),
  item("kitchen-beef-burger", "Beef Burger", 20000, "burger", "Beef patty, lettuce, onions, tomatoes and mayonnaise with French fries"),
  item("kitchen-vegetable-sandwich", "Vegetable Sandwich", 15000, "sandwich", "Grilled vegetables, lettuce, tomatoes and cheese with French fries"),
  item("kitchen-chicken-club-sandwich", "Chicken Club Sandwich", 20000, "sandwich", "Eggs, tomatoes, grilled chicken, lettuce and cheese with French fries"),
  item("kitchen-vegetable-burger", "Vegetable Burger", 15000, "burger", "Vegetable patty, onions, tomatoes, lettuce and cheese with French fries"),
  item("kitchen-chicken-crisp-sandwich", "Chicken Crisp Sandwich", 20000, "sandwich", "Grilled chicken, tomatoes, onions, lettuce and cheese with French fries"),
  item("kitchen-chicken-sandwich", "Chicken Sandwich", 20000, "sandwich", "Chopped grilled chicken, lettuce, onions, tomatoes and cheese with French fries"),
  item("kitchen-chicken-wings", "Chicken Wings", 20000, "snacks", "Six pieces served with chili sauce", 20),
  item("kitchen-chicken-lollipops", "Chicken Lollipops", 15000, "snacks", "Six pieces served with chili sauce", 20),
  item("kitchen-chicken-spring-rolls", "Chicken Spring Rolls", 15000, "snacks", "Four chicken and vegetable rolls served with chili sauce", 18),
  item("kitchen-vegetable-spring-rolls", "Vegetable Spring Rolls", 15000, "snacks", "Four vegetable rolls served with chili sauce", 18),
  item("kitchen-beef-samosa", "Beef Samosa", 10000, "snacks", "Four minced beef, onion and spice samosas", 15),
  item("kitchen-veg-samosa", "Veg Samosa", 6000, "snacks", "Four carrot, green pea and onion samosas", 15),
  item("kitchen-spaghetti-marinara", "Spaghetti Marinara", 20000, "pasta", "Spaghetti with parmesan sauce and cheese"),
  item("kitchen-spaghetti-arrabiata", "Spaghetti Arrabiata", 20000, "pasta", "Spaghetti with chili parmesan sauce and cheese"),
  item("kitchen-spaghetti-alfredo", "Spaghetti Alfredo", 25000, "pasta", "Spaghetti with white sauce, cheese and a choice of chicken"),
  item("kitchen-spaghetti-parmesan", "Spaghetti Parmesan", 25000, "pasta", "Spaghetti with parmesan sauce, grilled chicken and cheese"),
  item("kitchen-aubergine-parmesan", "Aubergine Parmesan", 20000, "pasta", "Spaghetti with fried aubergine, parmesan sauce and cheese"),
  item("kitchen-vegetable-spaghetti", "Vegetable Spaghetti", 15000, "pasta", "Spaghetti with cauliflower, broccoli, carrots and green beans"),
  item("kitchen-chicken-tikka-masala", "Chicken Tikka Masala", 30000, "local-food", "Chicken cubes, onions, Indian spices, tomato sauce and cashew nuts"),
  item("kitchen-chicken-makhan", "Chicken Makhan", 30000, "local-food", "Chicken, Indian spices, tomato sauce, cashew nuts and butter"),
  item("kitchen-dal-makhan", "Dal Makhan", 25000, "local-food", "Black dal, onions, Indian spices, tomato sauce and butter"),
  item("kitchen-mutton-rogan-josh", "Mutton Rogan Josh", 25000, "local-food", "Mutton, onions, Indian spices, tomato sauce and cashew nuts"),
  item("kitchen-chicken-biryani", "Chicken Biryani", 30000, "local-food", "Fragrant spiced rice with chicken"),
  item("kitchen-vegetable-biryani", "Vegetable Biryani", 25000, "local-food", "Spiced rice with vegetables, yogurt, cashew nuts, coriander and ghee"),
];
