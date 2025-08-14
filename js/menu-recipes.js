// === menu-recipes.js ===

// LocalStorage key
const menuKey = 'menuItems';
let menuData = JSON.parse(localStorage.getItem(menuKey)) || [];

// --- DOM Elements ---
const menuSelect = document.getElementById('menuSelect');
const selectedDrinkName = document.getElementById('selectedDrinkName');
const recipeEditor = document.getElementById('recipeEditor');
const ingredientList = document.getElementById('ingredientList');

const addMenuItemBtn = document.getElementById('addMenuItem');
const newMenuName = document.getElementById('newMenuName');
const newMenuPrice = document.getElementById('newMenuPrice');

const ingredientName = document.getElementById('ingredientName');
const ingredientQty = document.getElementById('ingredientQty');
const ingredientUnit = document.getElementById('ingredientUnit');
const addIngredientBtn = document.getElementById('addIngredient');
const saveRecipeBtn = document.getElementById('saveRecipe');

const importCSVInput = document.getElementById('importCSV');
const exportCSVBtn = document.getElementById('exportCSV');

let selectedMenuIndex = null;

// --- Populate Menu Dropdown ---
function populateMenuDropdown() {
  menuSelect.innerHTML = '<option value="">-- Select Menu Item --</option>';
  menuData.forEach((item, idx) => {
    const option = document.createElement('option');
    option.value = idx;
    option.textContent = `${item.name} (RM${item.price.toFixed(2)})`;
    menuSelect.appendChild(option);
  });
}

// --- Render Ingredients ---
function renderIngredients() {
  ingredientList.innerHTML = '';
  const ingredients = menuData[selectedMenuIndex]?.ingredients || [];
  ingredients.forEach((ing, idx) => {
    const div = document.createElement('div');
    div.className = 'ingredient-row';
    div.innerHTML = `
      <span>${ing.name} – ${ing.qty} ${ing.unit}</span>
      <button class="remove-btn" onclick="removeIngredient(${idx})">🗑</button>
    `;
    ingredientList.appendChild(div);
  });
}

// --- Remove Ingredient ---
function removeIngredient(index) {
  if (selectedMenuIndex === null) return;
  menuData[selectedMenuIndex].ingredients.splice(index, 1);
  saveToStorage();
  renderIngredients();
}

// --- Save to LocalStorage & Trigger Update ---
function saveToStorage() {
  localStorage.setItem(menuKey, JSON.stringify(menuData));
  populateMenuDropdown();
  // Trigger storage event so Order Management can refresh
  window.dispatchEvent(new StorageEvent('storage', {
    key: menuKey,
    newValue: JSON.stringify(menuData)
  }));
}

// --- Drink Selection ---
menuSelect.addEventListener('change', () => {
  selectedMenuIndex = parseInt(menuSelect.value);
  if (!isNaN(selectedMenuIndex)) {
    recipeEditor.classList.remove('hidden');
    selectedDrinkName.textContent = menuData[selectedMenuIndex].name;
    renderIngredients();
    renderDeleteButton();
  } else {
    recipeEditor.classList.add('hidden');
  }
});

// --- Add Ingredient ---
addIngredientBtn.addEventListener('click', () => {
  if (selectedMenuIndex === null) return;

  const ing = {
    name: ingredientName.value.trim(),
    qty: parseFloat(ingredientQty.value),
    unit: ingredientUnit.value.trim()
  };

  if (!ing.name || isNaN(ing.qty) || !ing.unit) {
    alert('Please enter valid ingredient details.');
    return;
  }

  menuData[selectedMenuIndex].ingredients.push(ing);
  renderIngredients();
  saveToStorage();

  ingredientName.value = '';
  ingredientQty.value = '';
  ingredientUnit.value = '';
});

// --- Save Recipe ---
saveRecipeBtn.addEventListener('click', () => {
  if (selectedMenuIndex === null) return;
  saveToStorage();
  alert('Recipe saved successfully!');
});

// --- Add New Drink ---
addMenuItemBtn.addEventListener('click', () => {
  const name = newMenuName.value.trim();
  const price = parseFloat(newMenuPrice.value);

  if (!name || isNaN(price)) {
    alert('Please enter a valid drink name and price.');
    return;
  }

  menuData.push({
    name,
    price,
    ingredients: []
  });

  saveToStorage();
  newMenuName.value = '';
  newMenuPrice.value = '';
  alert('New drink added!');
});

// --- Delete Drink ---
function renderDeleteButton() {
  let existingBtn = document.getElementById("deleteDrinkBtn");
  if (existingBtn) existingBtn.remove();

  const btn = document.createElement("button");
  btn.id = "deleteDrinkBtn";
  btn.textContent = "🗑️ Delete Drink";
  btn.className = "delete-drink-btn";

  btn.onclick = () => {
    if (!confirm(`Delete "${menuData[selectedMenuIndex].name}"? This cannot be undone.`)) return;
    menuData.splice(selectedMenuIndex, 1);
    selectedMenuIndex = null;
    saveToStorage();
    recipeEditor.classList.add("hidden");
    alert("Drink deleted.");
  };

  recipeEditor.appendChild(btn);
}

// --- CSV Export ---
exportCSVBtn?.addEventListener('click', () => {
  if (!menuData.length) return alert('No menu data to export.');

  let csvContent = 'Drink,Price,Ingredient,Qty,Unit\n';
  menuData.forEach(drink => {
    if (drink.ingredients.length) {
      drink.ingredients.forEach((ing, idx) => {
        csvContent += `${idx === 0 ? drink.name : ''},${idx === 0 ? drink.price : ''},${ing.name},${ing.qty},${ing.unit}\n`;
      });
    } else {
      csvContent += `${drink.name},${drink.price},,,\n`;
    }
  });

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'menu_recipes.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// --- CSV Import ---
importCSVInput?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target.result;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    let currentDrink = null;
    const newMenuData = [];

    lines.slice(1).forEach(line => {
      const [drinkName, drinkPrice, ingName, ingQty, ingUnit] = line.split(',').map(i => i.trim());

      if (drinkName) {
        currentDrink = {
          name: drinkName,
          price: parseFloat(drinkPrice) || 0,
          ingredients: []
        };
        newMenuData.push(currentDrink);
      }

      if (ingName && ingQty && ingUnit && currentDrink) {
        currentDrink.ingredients.push({
          name: ingName,
          qty: parseFloat(ingQty) || 0,
          unit: ingUnit
        });
      }
    });

    menuData = newMenuData;
    saveToStorage();
    alert('CSV imported successfully!');
  };
  reader.readAsText(file);
});

// --- Admin Access Control ---
if (localStorage.getItem('mintchaUser') !== 'admin') {
  document.getElementById('adminControls')?.remove();
  recipeEditor?.remove();
} else {
  populateMenuDropdown();
}
