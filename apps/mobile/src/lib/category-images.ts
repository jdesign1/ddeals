export const CATEGORY_IMAGES: Record<string, string> = {
  "Fruit & Veg": "/did-you-know/fruit-veg.webp",
  "Meat & Poultry": "/did-you-know/meat-poultry.webp",
  "Fish & Seafood": "/did-you-know/fish-seafood.webp",
  "Fridge & Deli": "/did-you-know/fridge-deli.webp",
  "Dairy & Eggs": "/did-you-know/dairy-eggs.webp",
  Bakery: "/did-you-know/bakery.webp",
  Frozen: "/did-you-know/frozen.webp",
  Pantry: "/did-you-know/pantry.webp",
  "Beer & Wine": "/did-you-know/beer-wine.webp",
  Drinks: "/did-you-know/drinks.webp",
  "Health & Body": "/did-you-know/health-body.webp",
  "Household & Cleaning": "/did-you-know/household-cleaning.webp",
  "Baby & Child": "/did-you-know/baby-child.webp",
  Pets: "/did-you-know/pets.webp",
};

export function getCategoryImageSrc(category: string): string {
  return CATEGORY_IMAGES[category] ?? CATEGORY_IMAGES.Pantry!;
}
