// === menu-recipes.js ===

const menuKey = 'menuItems';
let menuData = JSON.parse(localStorage.getItem(menuKey)) || [];

const CATEGORIES = {
  matcha:  { label: 'Matcha',  class: 'cat-matcha' },
  coffee:  { label: 'Coffee',  class: 'cat-coffee' },
  dessert: { label: 'Dessert', class: 'cat-dessert' }
};

// --- DOM Elements ---
const menuItemList = document.getElementById('menuItemList');
const menuSearch = document.getElementById('menuSearch');
const catTabs = document.getElementById('catTabs');
const editCategoryRow = document.getElementById('editCategoryRow');

const recipeEditor = document.getElementById('recipeEditor');
const recipeEditorInner = document.getElementById('recipeEditorInner');
const recipeEmptyState = document.getElementById('recipeEmptyState');
const selectedDrinkName = document.getElementById('selectedDrinkName');
const selectedDrinkCategory = document.getElementById('selectedDrinkCategory');
const ingredientList = document.getElementById('ingredientList');

const addMenuItemBtn = document.getElementById('addMenuItem');
const newMenuName = document.getElementById('newMenuName');
const newMenuPrice = document.getElementById('newMenuPrice');
const newMenuCategoryRow = document.getElementById('newMenuCategoryRow');

const ingredientName = document.getElementById('ingredientName');
const ingredientQty = document.getElementById('ingredientQty');
const ingredientUnit = document.getElementById('ingredientUnit');
const addIngredientBtn = document.getElementById('addIngredient');
const saveRecipeBtn = document.getElementById('saveRecipe');
const deleteDrinkBtn = document.getElementById('deleteDrinkBtn');

const importCSVInput = document.getElementById('importCSV');
const exportCSVBtn = document.getElementById('exportCSV');

let selectedMenuIndex = null;
let activeCategoryFilter = 'all';
let searchTerm = '';
let newItemCategory = null;

// --- Toast ---
let toastTimer = null;
function toast(message, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = isError ? 'error show' : 'show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// --- Category badge helper ---
function categoryBadge(catKey) {
  const cat = CATEGORIES[catKey];
  if (!cat) return '';
  return `<span class="cat-badge ${cat.class}">${cat.label}</span>`;
}

// --- Render menu list (left panel) ---
function renderMenuList() {
  menuItemList.innerHTML = '';

  const filtered = menuData
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => {
      const matchesCategory = activeCategoryFilter === 'all' || item.category === activeCategoryFilter;
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    });

  if (!filtered.length) {
    menuItemList.innerHTML = `<div class="empty-state">No menu items found.</div>`;
    return;
  }

  filtered.forEach(({ item, idx }) => {
    const card = document.createElement('div');
    card.className = 'menu-item-card' + (idx === selectedMenuIndex ? ' selected' : '');
    card.innerHTML = `
      <div class="menu-item-main">
        <span class="menu-item-name">${item.name}</span>
        <span class="menu-item-sub">
          ${categoryBadge(item.category)}
          <span class="menu-item-price">RM${item.price.toFixed(2)}</span>
        </span>
      </div>
      <span class="menu-item-ingcount">${item.ingredients.length} ingr.</span>
    `;
    card.addEventListener('click', () => selectMenuItem(idx));
    menuItemList.appendChild(card);
  });
}

// --- Select menu item ---
function selectMenuItem(idx) {
  selectedMenuIndex = idx;
  const item = menuData[idx];

  recipeEditorInner.classList.remove('hidden');
  recipeEmptyState.classList.add('hidden');

  selectedDrinkName.textContent = item.name;

  [...editCategoryRow.children].forEach(c => {
    c.classList.toggle('active', c.dataset.category === item.category);
  });

  renderIngredients();
  renderMenuList();
}

// --- Render Ingredients ---
function renderIngredients() {
  ingredientList.innerHTML = '';
  const ingredients = menuData[selectedMenuIndex]?.ingredients || [];

  if (!ingredients.length) {
    ingredientList.innerHTML = `<div class="empty-state">No ingredients yet — add the first one below.</div>`;
    return;
  }

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
  renderMenuList();
}

// --- Save to LocalStorage & Trigger Update ---
function saveToStorage() {
  localStorage.setItem(menuKey, JSON.stringify(menuData));
  window.dispatchEvent(new StorageEvent('storage', {
    key: menuKey,
    newValue: JSON.stringify(menuData)
  }));
}

// --- Category tabs (filter) ---
catTabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.cat-tab');
  if (!btn) return;
  [...catTabs.children].forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeCategoryFilter = btn.dataset.category;
  renderMenuList();
});

// --- Search ---
menuSearch.addEventListener('input', (e) => {
  searchTerm = e.target.value;
  renderMenuList();
});

// --- New item category picker ---
newMenuCategoryRow.addEventListener('click', (e) => {
  const choice = e.target.closest('.cat-choice');
  if (!choice) return;
  [...newMenuCategoryRow.children].forEach(c => c.classList.remove('active'));
  choice.classList.add('active');
  newItemCategory = choice.dataset.category;
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
    toast('Please enter valid ingredient details.', true);
    return;
  }

  menuData[selectedMenuIndex].ingredients.push(ing);
  renderIngredients();
  renderMenuList();
  saveToStorage();

  ingredientName.value = '';
  ingredientQty.value = '';
  ingredientUnit.value = '';
  ingredientName.focus();
});

// --- Save Recipe ---
saveRecipeBtn.addEventListener('click', () => {
  if (selectedMenuIndex === null) return;
  saveToStorage();
  toast('Recipe saved.');
});

// --- Edit category of selected menu item ---
editCategoryRow.addEventListener('click', (e) => {
  const choice = e.target.closest('.cat-choice');
  if (!choice || selectedMenuIndex === null) return;

  const newCategory = choice.dataset.category;
  menuData[selectedMenuIndex].category = newCategory;

  [...editCategoryRow.children].forEach(c => c.classList.remove('active'));
  choice.classList.add('active');

  saveToStorage();
  renderMenuList();
  toast(`Category updated to ${CATEGORIES[newCategory].label}.`);
});

// --- Add New Menu Item ---
addMenuItemBtn.addEventListener('click', () => {
  const name = newMenuName.value.trim();
  const price = parseFloat(newMenuPrice.value);

  if (!name || isNaN(price)) {
    toast('Please enter a valid drink name and price.', true);
    return;
  }
  if (!newItemCategory) {
    toast('Please choose a category.', true);
    return;
  }

  menuData.push({
    name,
    price,
    category: newItemCategory,
    ingredients: []
  });

  saveToStorage();
  renderMenuList();

  newMenuName.value = '';
  newMenuPrice.value = '';
  newItemCategory = null;
  [...newMenuCategoryRow.children].forEach(c => c.classList.remove('active'));

  toast('New menu item added.');
});

// --- Delete Drink ---
deleteDrinkBtn?.addEventListener('click', () => {
  if (selectedMenuIndex === null) return;
  if (!confirm(`Delete "${menuData[selectedMenuIndex].name}"? This cannot be undone.`)) return;

  menuData.splice(selectedMenuIndex, 1);
  selectedMenuIndex = null;

  recipeEditorInner.classList.add('hidden');
  recipeEmptyState.classList.remove('hidden');

  saveToStorage();
  renderMenuList();
  toast('Drink deleted.');
});

// --- CSV Export ---
exportCSVBtn?.addEventListener('click', () => {
  if (!menuData.length) return toast('No menu data to export.', true);

  let csvContent = 'Drink,Price,Category,Ingredient,Qty,Unit\n';
  menuData.forEach(drink => {
    if (drink.ingredients.length) {
      drink.ingredients.forEach((ing, idx) => {
        csvContent += `${idx === 0 ? drink.name : ''},${idx === 0 ? drink.price : ''},${idx === 0 ? drink.category : ''},${ing.name},${ing.qty},${ing.unit}\n`;
      });
    } else {
      csvContent += `${drink.name},${drink.price},${drink.category || ''},,,\n`;
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
      const [drinkName, drinkPrice, category, ingName, ingQty, ingUnit] = line.split(',').map(i => i.trim());

      if (drinkName) {
        currentDrink = {
          name: drinkName,
          price: parseFloat(drinkPrice) || 0,
          category: CATEGORIES[category] ? category : undefined,
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
    renderMenuList();
    toast('CSV imported successfully!');
  };
  reader.readAsText(file);
});

// --- Admin Access Control ---
if (localStorage.getItem('mintchaUser') !== 'admin') {
  document.getElementById('adminControls')?.remove();
}

renderMenuList();