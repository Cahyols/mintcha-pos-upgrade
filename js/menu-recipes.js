// === menu-recipes.js ===

const menuKey = 'menuItems';
let menuData = JSON.parse(localStorage.getItem(menuKey)) || [];

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

let selectedMenuIndex = null;

function populateMenuDropdown() {
  menuSelect.innerHTML = '<option value="">-- Select Menu Item --</option>';
  menuData.forEach((item, idx) => {
    const option = document.createElement('option');
    option.value = idx;
    option.textContent = `${item.name} (RM${item.price})`;
    menuSelect.appendChild(option);
  });
}

function renderIngredients() {
  ingredientList.innerHTML = '';
  const ingredients = menuData[selectedMenuIndex]?.ingredients || [];
  ingredients.forEach((ing, idx) => {
    const div = document.createElement('div');
    div.className = 'ingredient-row';
    div.innerHTML = `
      <span>${ing.name} – ${ing.qty} ${ing.unit}</span>
      <button onclick="removeIngredient(${idx})">🗑 Remove</button>
    `;
    ingredientList.appendChild(div);
  });
}

function removeIngredient(index) {
  menuData[selectedMenuIndex].ingredients.splice(index, 1);
  saveToStorage();
  renderIngredients();
}

function saveToStorage() {
  localStorage.setItem(menuKey, JSON.stringify(menuData));
  populateMenuDropdown();
}

// === On Drink Selection ===
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

// === Add Ingredient ===
addIngredientBtn.addEventListener('click', () => {
  const ing = {
    name: ingredientName.value.trim(),
    qty: parseFloat(ingredientQty.value),
    unit: ingredientUnit.value.trim()
  };
  if (ing.name && !isNaN(ing.qty) && ing.unit) {
    menuData[selectedMenuIndex].ingredients.push(ing);
    renderIngredients();
    ingredientName.value = '';
    ingredientQty.value = '';
    ingredientUnit.value = '';
  }
});

// === Save Recipe ===
saveRecipeBtn.addEventListener('click', () => {
  saveToStorage();
  alert('Recipe saved successfully!');
});

// === Add New Drink ===
addMenuItemBtn.addEventListener('click', () => {
  const name = newMenuName.value.trim();
  const price = parseFloat(newMenuPrice.value);
  if (name && !isNaN(price)) {
    menuData.push({ name, price, ingredients: [] });
    saveToStorage();
    newMenuName.value = '';
    newMenuPrice.value = '';
    alert('New drink added!');
  }
});

// === Render Delete Button ===
function renderDeleteButton() {
  let existingBtn = document.getElementById("deleteDrinkBtn");
  if (existingBtn) existingBtn.remove();

  const btn = document.createElement("button");
  btn.id = "deleteDrinkBtn";
  btn.textContent = "🗑️ Delete Drink";
  btn.style.backgroundColor = "#e74c3c";
  btn.style.color = "#fff";
  btn.style.marginTop = "10px";

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

// === Admin Access Control ===
if (localStorage.getItem('mintchaUser') !== 'admin') {
  document.getElementById('adminControls')?.remove();
  recipeEditor?.remove();
} else {
  // If admin, ensure recipes are editable
  populateMenuDropdown();
}
