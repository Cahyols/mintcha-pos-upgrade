// js/load-recipe-data.js

const updatedRecipes = {
  "Matcha Muse": [
    { ingredient: "Noomoo Oat Milk", qty: 220 },
    { ingredient: "Nestle Bear Milk", qty: 15 },
    { ingredient: "Yun Matcha Powder", qty: 5 },
    { ingredient: "Earl Grey Syrup", qty: 7 },
    { ingredient: "Cup", qty: 1 },
    { ingredient: "Flat Lid", qty: 1 },
    { ingredient: "Small Straw", qty: 1 }
  ],
  "Mintcha Bloom": [
    { ingredient: "Noomoo Oat Milk", qty: 190 },
    { ingredient: "Nestle Bear Milk", qty: 15 },
    { ingredient: "Yun Matcha Powder", qty: 5 },
    { ingredient: "Mint Syrup", qty: 15 },
    { ingredient: "Earl Grey Syrup", qty: 7 },
    { ingredient: "Cup", qty: 1 },
    { ingredient: "Flat Lid", qty: 1 },
    { ingredient: "Small Straw", qty: 1 }
  ],
  "Ichigo Shortcha": [
    { ingredient: "Noomoo Oat Milk", qty: 190 },
    { ingredient: "Nestle Bear Milk", qty: 15 },
    { ingredient: "Yun Matcha Powder", qty: 5 },
    { ingredient: "Shortcake Ice Cream", qty: 50 },
    { ingredient: "Earl Grey Syrup", qty: 7 },
    { ingredient: "Strawberry Puri", qty: 30 },
    { ingredient: "Cup", qty: 1 },
    { ingredient: "Dome Lid", qty: 1 },
    { ingredient: "Big Straw", qty: 1 }
  ],
  "Mint Majesty": [
    { ingredient: "Milk Lab Full Cream", qty: 180 },
    { ingredient: "Nestle Bear Milk", qty: 15 },
    { ingredient: "Mint Syrup", qty: 30 },
    { ingredient: "Cup", qty: 1 },
    { ingredient: "Flat Lid", qty: 1 },
    { ingredient: "Small Straw", qty: 1 }
  ],
  "Frosted Mintcha": [
    { ingredient: "Justea Grape", qty: 150 },
    { ingredient: "Sparkling Water", qty: 150 },
    { ingredient: "Yuzu Syrup", qty: 15 },
    { ingredient: "Mint Syrup", qty: 15 },
    { ingredient: "Cup", qty: 1 },
    { ingredient: "Flat Lid", qty: 1 },
    { ingredient: "Small Straw", qty: 1 }
  ]
};

localStorage.setItem("mintcha_recipes", JSON.stringify(updatedRecipes));
alert("✅ Updated recipe data stored in localStorage.");
