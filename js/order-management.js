let sampleMenu = JSON.parse(localStorage.getItem("menuItems")) || [];

// === Cart & Discount State ===
let cart = [];
let appliedDiscount = null;

// === Reorder (drag & drop) state ===
let dragSrcIndex = null;

// === Category filter state (Order Management menu grid) ===
// Defaults to "matcha" so the page opens straight into that tab.
let activeMenuCategoryFilter = "matcha";

// === Order type state (Dine In / Delivery) ===
// Each menu item can now carry two prices: `price` (dine in) and
// `priceDelivery` (delivery). If an item has no priceDelivery set yet,
// it falls back to the dine-in price so old menu data keeps working.
let activeOrderType = "dineIn"; // "dineIn" | "delivery"

// === Cash payment state ===
// Amount tendered builds up as the cashier taps denomination buttons
// (or types a custom amount via "Others"), same as a physical cash
// drawer workflow — not typed as one lump number.
let cashAmountReceived = 0;

// === Menu card color tagging ===
// 5 preset colors only, kept simple — no custom color picker needed.
const CARD_COLORS = [
  { name: "Rose",    value: "#ffcdd2" },
  { name: "Amber",   value: "#ffe0b2" },
  { name: "Mint",    value: "#c8e6c9" },
  { name: "Sky",     value: "#b3e5fc" },
  { name: "Lavender",value: "#d1c4e9" },
  { name: "Soft Chocolate", value: "#bcaaa4" },
  { name: "Buttercream", value: "#EED7A1" },
  { name: "Red", value: "#ff7477" },
];

// === DOM Elements ===
const menuContainer = document.getElementById("menuItems");
const priceControls = document.getElementById("priceControls");
const menuEmptyState = document.getElementById("menuEmptyState");
const menuCatTabs = document.getElementById("menuCatTabs");
const orderTypeTabs = document.getElementById("orderTypeTabs");
const cartList = document.getElementById("cartList");
const cartEmptyState = document.getElementById("cartEmptyState");
const summarySubtotal = document.getElementById("summarySubtotal");
const summaryDiscountRow = document.getElementById("summaryDiscountRow");
const summaryDiscount = document.getElementById("summaryDiscount");
const summaryTotal = document.getElementById("summaryTotal");
const discountLabelEl = document.getElementById("discountLabel");
const proceedPayment = document.getElementById("proceedPayment");
const cancelOrder = document.getElementById("cancelOrder");
const paymentModal = document.getElementById("paymentModal");
const closePaymentModal = document.getElementById("closePaymentModal");
const paymentButtons = document.querySelectorAll(".payment-btn");
const receiptModal = document.getElementById("receiptModal");
const receiptContent = document.getElementById("receiptContent");
const discountBtn = document.getElementById("discountBtn");
const discountModal = document.getElementById("discountModal");
const closeDiscountModal = document.getElementById("closeDiscountModal");
const discountOptions = document.querySelectorAll(".discount-option");
const removeDiscountBtn = document.getElementById("removeDiscountBtn");

// === Cash Payment Modal elements ===
const cashPaymentModal = document.getElementById("cashPaymentModal");
const closeCashModal = document.getElementById("closeCashModal");
const cashTotalDue = document.getElementById("cashTotalDue");
const cashDenoms = document.getElementById("cashDenoms");
const cashOthersInput = document.getElementById("cashOthersInput");
const cashOthersAddBtn = document.getElementById("cashOthersAddBtn");
const cashExactBtn = document.getElementById("cashExactBtn");
const cashReceivedDisplay = document.getElementById("cashReceivedDisplay");
const cashBalanceRow = document.getElementById("cashBalanceRow");
const cashBalanceLabel = document.getElementById("cashBalanceLabel");
const cashBalanceDisplay = document.getElementById("cashBalanceDisplay");
const cashClearBtn = document.getElementById("cashClearBtn");
const cashConfirmBtn = document.getElementById("cashConfirmBtn");

// === Toast feedback, reusing the site's existing .toast/.show CSS component ===
// Named showOrderToast (not showToast) to avoid colliding with anything
// common.js may already define.
let orderToastTimer = null;
function showOrderToast(message) {
  let toast = document.getElementById("orderToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "orderToast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(orderToastTimer);
  orderToastTimer = setTimeout(() => toast.classList.remove("show"), 1600);
}

// === Price resolution helper ===
function getItemPrice(item, orderType = activeOrderType) {
  if (orderType === "delivery") {
    const dPrice = parseFloat(item.priceDelivery);
    return !isNaN(dPrice) ? dPrice : parseFloat(item.price);
  }
  return parseFloat(item.price);
}

// === Current admin mode helper ===
function getCurrentAdminMode() {
  const editBtn = document.getElementById("toggleEditPrices");
  const reorderBtn = document.getElementById("toggleReorder");
  if (editBtn?.classList.contains("active-mode")) return "editPrices";
  if (reorderBtn?.classList.contains("active-mode")) return "reorder";
  return "view";
}

// === Stock availability helpers ===
//
// Uses the exact same name-matching + unit-conversion logic as the
// deduction function below, so "how many can we still make" and "how much
// gets deducted at checkout" can never disagree with each other.
//
// An ingredient with NO matching stock item doesn't constrain availability
// at all (e.g. "Small Straw" may not be tracked yet) — only ingredients
// you're actively tracking in Stock Overview can ever cause a "Sold Out".
function getMaxMakeableFromStock(menuItem) {
  if (!Array.isArray(menuItem.ingredients) || !menuItem.ingredients.length) {
    return Infinity;
  }

  const stockList = JSON.parse(localStorage.getItem("mintcha_stock") || "[]");
  let maxMakeable = Infinity;

  menuItem.ingredients.forEach(ing => {
    const perDrink = parseFloat(ing.qty) || 0;
    if (perDrink <= 0 || !ing.name) return;

    const stockItem = stockList.find(
      s => (s.name || "").trim().toLowerCase() === ing.name.trim().toLowerCase()
    );
    if (!stockItem) return; // untracked ingredient — doesn't limit availability

    const conv = parseFloat(stockItem.conversionValue);
    const availableInRecipeUnits = conv && conv > 0
      ? (parseFloat(stockItem.quantity) || 0) * conv
      : (parseFloat(stockItem.quantity) || 0);

    const makeableFromThisIngredient = Math.floor(availableInRecipeUnits / perDrink);
    maxMakeable = Math.min(maxMakeable, makeableFromThisIngredient);
  });

  return maxMakeable; // stays Infinity if nothing tracked constrains it
}

// Subtracts what's already sitting in the current cart, so availability
// reflects "how many MORE can be added," not just raw stock on the shelf.
function getRemainingAvailable(menuItem) {
  const max = getMaxMakeableFromStock(menuItem);
  if (max === Infinity) return Infinity;
  const inCart = cart.find(c => c.name === menuItem.name);
  const alreadyQueued = inCart ? inCart.qty : 0;
  return max - alreadyQueued;
}

// Walks the already-rendered "view mode" cards and toggles sold-out state
// without rebuilding the whole grid — cheap enough to call on every cart
// change, and avoids interrupting the "just-added" animation on a card
// that was just clicked.
function applyAvailabilityToRenderedMenu() {
  if (!menuContainer) return;
  const cards = menuContainer.querySelectorAll(".menu-item[data-index]");

  cards.forEach(div => {
    // Only "view mode" cards are click-to-add (they carry role="button");
    // edit/reorder mode cards should stay fully interactable regardless
    // of stock, since an admin still needs to edit/reorder sold-out drinks.
    if (div.getAttribute("role") !== "button") return;

    const idx = parseInt(div.dataset.index, 10);
    const item = sampleMenu[idx];
    if (!item) return;

    const remaining = getRemainingAvailable(item);
    const soldOut = remaining <= 0;

    div.classList.toggle("menu-item-unavailable", soldOut);
    div.setAttribute("aria-disabled", soldOut ? "true" : "false");
    div.tabIndex = soldOut ? -1 : 0;

    let badge = div.querySelector(".sold-out-badge");
    if (soldOut && !badge) {
      badge = document.createElement("span");
      badge.className = "sold-out-badge";
      badge.textContent = "Sold Out";
      div.appendChild(badge);
    } else if (!soldOut && badge) {
      badge.remove();
    }
  });
}

// === Order type tabs (Dine In / Delivery) ===
function setupOrderTypeTabs() {
  if (!orderTypeTabs) return;
  orderTypeTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".order-type-tab");
    if (!btn) return;
    const newType = btn.dataset.ordertype;
    if (newType === activeOrderType) return;

    if (cart.length) {
      const label = newType === "delivery" ? "Delivery" : "Dine In";
      const ok = confirm(
        `Switch to ${label}? Dine In and Delivery can have different prices, so your current cart will be cleared.`
      );
      if (!ok) return;
      cart = [];
      resetDiscount();
      updateCart();
    }

    activeOrderType = newType;
    [...orderTypeTabs.children].forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderMenu(getCurrentAdminMode());
    showOrderToast(newType === "delivery" ? "🛵 Delivery pricing" : "🍽️ Dine In pricing");
  });
}

// === Category filter tabs ===
function setupMenuCategoryTabs() {
  if (!menuCatTabs) return;
  menuCatTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".menu-cat-tab");
    if (!btn) return;
    [...menuCatTabs.children].forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeMenuCategoryFilter = btn.dataset.category;
    renderMenu("view");
  });
}

// === Render Menu Items ===
function renderMenu(mode = "view") {
  if (mode === true) mode = "editPrices";
  if (mode === false || mode == null) mode = "view";

  sampleMenu = JSON.parse(localStorage.getItem("menuItems")) || [];
  menuContainer.innerHTML = "";

  if (!sampleMenu.length) {
    menuEmptyState.classList.remove("hidden");
    return;
  }

  const visibleEntries = sampleMenu
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (mode !== "view") return true;
      if (activeMenuCategoryFilter === "all") return true;
      return (item.category || "uncategorized") === activeMenuCategoryFilter;
    });

  if (mode === "view" && !visibleEntries.length) {
    menuEmptyState.classList.remove("hidden");
    menuEmptyState.textContent = "No drinks in this category yet.";
    return;
  }
  menuEmptyState.classList.add("hidden");
  menuEmptyState.textContent = "";
  if (!menuEmptyState.innerHTML.trim()) {
    menuEmptyState.innerHTML = `No menu yettt yet. Add your first drink in <a href="menu-recipes.html">Menu Recipes</a>.`;
  }

  visibleEntries.forEach(({ item, index }) => {
    const div = document.createElement("div");
    div.className = "menu-item";
    div.dataset.index = index;
    div.title = item.name;

    if (item.color) {
      div.style.backgroundColor = item.color;
    }

    if (mode === "editPrices") {
      const isDelivery = activeOrderType === "delivery";
      const label = isDelivery ? "Delivery" : "Dine In";
      const priceValue = isDelivery
        ? parseFloat(item.priceDelivery ?? item.price)
        : parseFloat(item.price);
      const inputClass = isDelivery ? "price-input-delivery" : "price-input";
      div.innerHTML = `
        <input
              type="text"
              value="${item.name.replace(/"/g, "&quot;")}"
              class="name-input"
              data-index="${index}"
              aria-label="Name for ${item.name}">
        <label class="price-edit-label">${label}
          <span class="price-tag">RM <input
              type="number"
              step="0.01"
              value="${priceValue.toFixed(2)}"
              class="${inputClass}"
              data-index="${index}"
              aria-label="${label} price for ${item.name}"></span>
        </label>
      `;
    } else if (mode === "reorder") {
      div.classList.add("draggable-item");
      div.draggable = true;
      div.innerHTML = `
        <span class="drag-handle" title="Drag to reorder">⠿</span>
        <strong>${item.name}</strong>
        <span class="price-tag">RM${getItemPrice(item).toFixed(2)}</span>
      `;
      attachDragHandlers(div, index);
    } else {
      const price = getItemPrice(item);
      div.innerHTML = `
        <strong>${item.name}</strong>
        <span class="price-tag">RM${price.toFixed(2)}</span>
      `;
      div.tabIndex = 0;
      div.setAttribute("role", "button");
      div.setAttribute("aria-label", `Add ${item.name}, RM${price.toFixed(2)}, to cart`);
      div.onclick = () => {
        if (div.classList.contains("menu-item-unavailable")) {
          showOrderToast(`${item.name} is sold out — not enough stock`);
          return;
        }
        addToCart(index, div);
      };
      div.onkeydown = (e) => {
        if (div.classList.contains("menu-item-unavailable")) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          addToCart(index, div);
        }
      };
    }

    attachColorPicker(div, index);

    menuContainer.appendChild(div);
  });

  // Gray out / disable any card that's actually sold out, right after building
  // the grid (only affects "view" mode cards — see the role="button" check inside).
  applyAvailabilityToRenderedMenu();
}

// === Color tag picker ===
function attachColorPicker(div, index) {
  const dot = document.createElement("button");
  dot.type = "button";
  dot.className = "color-dot-btn";
  dot.title = "Set card color";
  dot.setAttribute("aria-label", "Set card color");

  const item = sampleMenu[index];
  dot.style.backgroundColor = item.color || "#fff";
  if (!item.color) dot.classList.add("color-dot-empty");

  dot.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();

    document.querySelectorAll(".color-swatch-popover").forEach(p => p.remove());

    const popover = document.createElement("div");
    popover.className = "color-swatch-popover";

    CARD_COLORS.forEach(color => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "color-swatch";
      swatch.style.backgroundColor = color.value;
      swatch.title = color.name;
      swatch.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setCardColor(index, color.value);
        popover.remove();
      });
      popover.appendChild(swatch);
    });

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "color-swatch color-swatch-clear";
    clearBtn.title = "Clear color";
    clearBtn.textContent = "✕";
    clearBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setCardColor(index, null);
      popover.remove();
    });
    popover.appendChild(clearBtn);

    div.appendChild(popover);

    const closeOnOutsideClick = (ev) => {
      if (!popover.contains(ev.target) && ev.target !== dot) {
        popover.remove();
        document.removeEventListener("click", closeOnOutsideClick);
      }
    };
    setTimeout(() => document.addEventListener("click", closeOnOutsideClick), 0);
  });

  div.appendChild(dot);
}

function setCardColor(index, colorValue) {
  sampleMenu = JSON.parse(localStorage.getItem("menuItems")) || [];
  if (colorValue) {
    sampleMenu[index].color = colorValue;
  } else {
    delete sampleMenu[index].color;
  }
  localStorage.setItem("menuItems", JSON.stringify(sampleMenu));

  renderMenu(getCurrentAdminMode());
  showOrderToast(colorValue ? "Card color updated" : "Card color cleared");
}

// === Drag & Drop reorder handlers ===
function attachDragHandlers(div, index) {
  div.addEventListener("dragstart", (e) => {
    dragSrcIndex = index;
    div.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  });

  div.addEventListener("dragend", () => {
    div.classList.remove("dragging");
    document
      .querySelectorAll(".menu-item.drag-over")
      .forEach((el) => el.classList.remove("drag-over"));
  });

  div.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    div.classList.add("drag-over");
  });

  div.addEventListener("dragleave", () => {
    div.classList.remove("drag-over");
  });

  div.addEventListener("drop", (e) => {
    e.preventDefault();
    div.classList.remove("drag-over");

    const targetIndex = index;
    if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;

    const moved = sampleMenu.splice(dragSrcIndex, 1)[0];
    sampleMenu.splice(targetIndex, 0, moved);
    localStorage.setItem("menuItems", JSON.stringify(sampleMenu));

    dragSrcIndex = null;
    renderMenu("reorder");
  });
}

// === Render Admin Controls (Edit Prices + Reorder Menu) ===
function renderPriceEditorIfAdmin() {
  const role = localStorage.getItem("mintchaRole");
  if (role !== "admin") return;

  priceControls.innerHTML = `
    <button id="toggleEditPrices" class="admin-mode-tab">🖊️ Edit Menu</button>
    <button id="toggleReorder" class="admin-mode-tab">🔀 Reorder Menu</button>
  `;

  let currentMode = "view";
  const editBtn = document.getElementById("toggleEditPrices");
  const reorderBtn = document.getElementById("toggleReorder");

 editBtn.addEventListener("click", () => {
    if (currentMode === "editPrices") {
      const priceInputs = document.querySelectorAll(".price-input");
      const deliveryPriceInputs = document.querySelectorAll(".price-input-delivery");
      const nameInputs = document.querySelectorAll(".name-input");

      for (const input of nameInputs) {
        if (!input.value.trim()) {
          alert("Item name can't be empty.");
          return;
        }
      }

      const renames = [];

      nameInputs.forEach((input) => {
        const idx = input.dataset.index;
        const newName = input.value.trim();
        const oldName = sampleMenu[idx].name;
        if (newName !== oldName) renames.push({ oldName, newName });
        sampleMenu[idx].name = newName;
      });

      priceInputs.forEach((input) => {
        const idx = input.dataset.index;
        const newPrice = parseFloat(input.value);
        if (!isNaN(newPrice)) sampleMenu[idx].price = newPrice;
      });

      deliveryPriceInputs.forEach((input) => {
        const idx = input.dataset.index;
        const newPrice = parseFloat(input.value);
        if (!isNaN(newPrice)) sampleMenu[idx].priceDelivery = newPrice;
      });

      localStorage.setItem("menuItems", JSON.stringify(sampleMenu));

      currentMode = "view";
      editBtn.textContent = "🖊️ Edit Menu";
      editBtn.classList.remove("active-mode");
      reorderBtn.disabled = false;
      renderMenu("view");
      showOrderToast(renames.length ? "Menu updated (name & price)" : "Prices saved");
    } else {
      currentMode = "editPrices";
      editBtn.textContent = "💾 Save Menu";
      editBtn.classList.add("active-mode");
      reorderBtn.disabled = true;
      renderMenu("editPrices");
    }
  });

  reorderBtn.addEventListener("click", () => {
    if (currentMode === "reorder") {
      currentMode = "view";
      reorderBtn.textContent = "🔀 Reorder Menu";
      reorderBtn.classList.remove("active-mode");
      editBtn.disabled = false;
      renderMenu("view");
    } else {
      currentMode = "reorder";
      reorderBtn.textContent = "✅ Done Reordering";
      reorderBtn.classList.add("active-mode");
      editBtn.disabled = true;
      renderMenu("reorder");
    }
  });
}

// === Cart Functions ===
function addToCart(index, cardEl) {
  const selected = sampleMenu[index];

  if (getRemainingAvailable(selected) <= 0) {
    showOrderToast(`${selected.name} is sold out — not enough stock`);
    applyAvailabilityToRenderedMenu();
    return;
  }

  const price = getItemPrice(selected);
  const existing = cart.find(i => i.name === selected.name);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ name: selected.name, price, qty: 1 });
  }
  updateCart();

  if (cardEl) {
    cardEl.classList.remove("just-added");
    void cardEl.offsetWidth;
    cardEl.classList.add("just-added");
  }
  showOrderToast(`${selected.name} added to cart`);
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCart();
}

function increaseQty(index) {
  const item = cart[index];
  const menuItem = sampleMenu.find(m => m.name === item.name);
  if (menuItem && getRemainingAvailable(menuItem) <= 0) {
    showOrderToast(`No more ${item.name} available — out of stock`);
    return;
  }
  cart[index].qty++;
  updateCart();
}

function decreaseQty(index) {
  if (cart[index].qty > 1) {
    cart[index].qty--;
  } else {
    cart.splice(index, 1);
  }
  updateCart();
}

// === Discount Calculation (single source of truth) ===
function calculateDiscount(cartItems, discountLabel) {
  const subtotal = cartItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const totalQty = cartItems.reduce((sum, i) => sum + i.qty, 0);

  let discountAmount = 0;

  switch (discountLabel) {
    case "5% Off":
      discountAmount = subtotal * 0.05;
      break;
    case "10% Off":
      discountAmount = subtotal * 0.10;
      break;
    case "20% Off":
      discountAmount = subtotal * 0.20;
      break;
    case "Buy 2 Free 1":
      if (totalQty >= 3) {
        const freeCount = Math.floor(totalQty / 3);
        const expanded = [];
        cartItems.forEach(item => {
          for (let i = 0; i < item.qty; i++) expanded.push(item.price);
        });
        expanded.sort((a, b) => a - b);
        for (let i = 0; i < freeCount; i++) {
          discountAmount += expanded[i];
        }
      }
      break;
      case "Free":
      discountAmount = subtotal;
      break;
  }

  if (discountAmount > subtotal) discountAmount = subtotal;

  return discountAmount;
}

// === Stock deduction + usage logging (runs once per completed sale) ===
function deductStockForSaleAndLogUsage(cartItems) {
  const stockList = JSON.parse(localStorage.getItem("mintcha_stock") || "[]");
  const usageData = JSON.parse(localStorage.getItem("mintcha_usage") || "{}");
  const todayKey = new Date().toISOString().split("T")[0];
  if (!usageData[todayKey]) usageData[todayKey] = {};

  const depletedItems = [];

  cartItems.forEach(cartItem => {
    const menuItem = sampleMenu.find(m => m.name === cartItem.name);
    if (!menuItem || !Array.isArray(menuItem.ingredients)) return;

    menuItem.ingredients.forEach(ing => {
      const usedQty = (parseFloat(ing.qty) || 0) * cartItem.qty;
      if (usedQty <= 0 || !ing.name) return;

      const key = ing.name.trim();
      if (!usageData[todayKey][key]) {
        usageData[todayKey][key] = { total: 0, unit: ing.unit || "" };
      }
      usageData[todayKey][key].total += usedQty;

      const stockItem = stockList.find(
        s => (s.name || "").trim().toLowerCase() === key.toLowerCase()
      );
      if (!stockItem) return;

      const conv = parseFloat(stockItem.conversionValue);
      const deduction = conv && conv > 0 ? usedQty / conv : usedQty;

      const before = parseFloat(stockItem.quantity) || 0;
      const after = Math.max(0, before - deduction);
      stockItem.quantity = after;

      if (after <= 0 && before > 0) {
        depletedItems.push(stockItem.name);
      }
    });
  });

  localStorage.setItem("mintcha_stock", JSON.stringify(stockList));
  localStorage.setItem("mintcha_usage", JSON.stringify(usageData));

  return depletedItems;
}

// === Update Cart ===
function updateCart() {
  if (!cart.length && appliedDiscount) {
    appliedDiscount = null;
  }

  cartList.innerHTML = "";
  let subtotal = 0;

  if (!cart.length) {
    cartEmptyState.classList.remove("hidden");
  } else {
    cartEmptyState.classList.add("hidden");
  }

  cart.forEach((item, idx) => {
    const lineTotal = item.price * item.qty;
    subtotal += lineTotal;
    const div = document.createElement("div");
    div.className = "cart-item";
    div.innerHTML = `
      <div class="cart-item-top">
        <span class="item-name">${item.name}</span>
        <span class="unit-price">RM${item.price.toFixed(2)} ea</span>
      </div>
      <div class="cart-item-bottom">
        <div class="item-controls">
          <button aria-label="Decrease quantity of ${item.name}" onclick="decreaseQty(${idx})">−</button>
          <span>${item.qty}</span>
          <button aria-label="Increase quantity of ${item.name}" onclick="increaseQty(${idx})">+</button>
          <button class="remove-btn" aria-label="Remove ${item.name} from cart" onclick="removeFromCart(${idx})">🗑️</button>
        </div>
        <span class="line-total">RM${lineTotal.toFixed(2)}</span>
      </div>
    `;
    cartList.appendChild(div);
  });

  const discountAmount = calculateDiscount(cart, appliedDiscount);
  const total = subtotal - discountAmount;

  summarySubtotal.textContent = `RM${subtotal.toFixed(2)}`;
  summaryTotal.textContent = `RM${total.toFixed(2)}`;

  if (appliedDiscount) {
    discountLabelEl.textContent = appliedDiscount;
    summaryDiscount.textContent = `-RM${discountAmount.toFixed(2)}`;
    summaryDiscountRow.classList.remove("hidden");
    summaryDiscountRow.style.display = "flex";
  } else {
    summaryDiscountRow.classList.add("hidden");
    summaryDiscountRow.style.display = "none";
    summaryDiscount.textContent = "-RM0.00";
    discountLabelEl.textContent = "";
  }

  // Cart quantities affect "how much MORE stock is left" — re-check every
  // rendered card's sold-out state whenever the cart changes.
  applyAvailabilityToRenderedMenu();
}

// === Discount Modal Handling ===
discountBtn?.addEventListener("click", () => {
  discountModal.style.display = "flex";
});

closeDiscountModal?.addEventListener("click", () => {
  discountModal.style.display = "none";
});

discountOptions.forEach(button => {
  button.addEventListener("click", () => {
    if (appliedDiscount) {
      alert(`A discount (${appliedDiscount}) is already applied! Remove it first.`);
      return;
    }

    const type = button.dataset.type;
    const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);

    switch (type) {
      case "buy2free1":
        if (totalQty < 3)
          return alert("❌ Buy 2 Free 1 requires at least 3 items.");
        appliedDiscount = "Buy 2 Free 1";
        break;
      case "5off":
        appliedDiscount = "5% Off";
        break;
      case "10off":
        appliedDiscount = "10% Off";
        break;
      case "20off":
        appliedDiscount = "20% Off";
        break;
        case "free":
        appliedDiscount = "Free";
        break;
    }

    updateCart();
    showOrderToast(`${appliedDiscount} applied`);
    discountModal.style.display = "none";
  });
});

removeDiscountBtn?.addEventListener("click", () => {
  if (!appliedDiscount) return alert("No discount applied.");
  appliedDiscount = null;
  updateCart();
  showOrderToast("Discount removed");
  discountModal.style.display = "flex";
});

// === Cancel Order ===
cancelOrder?.addEventListener("click", () => {
  if (!cart.length) return;
  if (!confirm("Clear this order? This can't be undone.")) return;
  cart = [];
  resetDiscount();
  updateCart();
  showOrderToast("Order cleared");
});

function resetDiscount() {
  appliedDiscount = null;
}

function generateOrderId() {
  const today = new Date().toISOString().split("T")[0];
  const key = `mintcha_order_id_${today}`;
  let currentNumber = parseInt(localStorage.getItem(key) || "0", 10);
  currentNumber++;
  localStorage.setItem(key, currentNumber);
  return `ORD-${String(currentNumber).padStart(4, "0")}`;
}

// === Current order total helper (subtotal - discount) ===
// Shared by the payment modal and the cash modal so both always agree on
// what's actually owed, using the exact same discount logic as the cart.
function getCurrentOrderTotal() {
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const discountAmount = calculateDiscount(cart, appliedDiscount);
  return Math.max(0, subtotal - discountAmount);
}

// === Cash Payment Modal ===
// Denomination buttons ADD to the running "amount received" (like counting
// notes onto a drawer), rather than replacing it — so a cashier can tap
// RM50 + RM20 + RM5 to build up RM75 tendered. "Others" lets them add any
// non-standard amount (coins, odd notes). "Exact" is a shortcut for when
// the customer pays the precise total with no change needed.
function updateCashModalDisplay() {
  const total = getCurrentOrderTotal();
  const balance = cashAmountReceived - total;

  cashReceivedDisplay.textContent = `RM${cashAmountReceived.toFixed(2)}`;

  if (cashAmountReceived <= 0) {
    cashBalanceRow.classList.remove("insufficient", "has-change");
    cashBalanceLabel.textContent = "Balance";
    cashBalanceDisplay.textContent = `RM${total.toFixed(2)}`;
    cashConfirmBtn.disabled = true;
  } else if (balance < 0) {
    cashBalanceRow.classList.add("insufficient");
    cashBalanceRow.classList.remove("has-change");
    cashBalanceLabel.textContent = "Still Owing";
    cashBalanceDisplay.textContent = `RM${Math.abs(balance).toFixed(2)}`;
    cashConfirmBtn.disabled = true;
  } else {
    cashBalanceRow.classList.remove("insufficient");
    cashBalanceRow.classList.add("has-change");
    cashBalanceLabel.textContent = "Change Due";
    cashBalanceDisplay.textContent = `RM${balance.toFixed(2)}`;
    cashConfirmBtn.disabled = false;
  }
}

function openCashModal() {
  cashAmountReceived = 0;
  cashOthersInput.value = "";
  cashTotalDue.textContent = `RM${getCurrentOrderTotal().toFixed(2)}`;
  updateCashModalDisplay();
  paymentModal.style.display = "none";
  cashPaymentModal.style.display = "flex";
}

function closeCashPaymentModal() {
  cashPaymentModal.style.display = "none";
  cashAmountReceived = 0;
}

cashDenoms?.addEventListener("click", (e) => {
  const btn = e.target.closest(".cash-denom-btn");
  if (!btn) return;
  cashAmountReceived += parseFloat(btn.dataset.amount) || 0;
  updateCashModalDisplay();
});

cashOthersAddBtn?.addEventListener("click", () => {
  const val = parseFloat(cashOthersInput.value);
  if (isNaN(val) || val <= 0) {
    showOrderToast("Enter a valid amount first");
    return;
  }
  cashAmountReceived += val;
  cashOthersInput.value = "";
  updateCashModalDisplay();
});

cashOthersInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    cashOthersAddBtn.click();
  }
});

cashExactBtn?.addEventListener("click", () => {
  cashAmountReceived = getCurrentOrderTotal();
  updateCashModalDisplay();
});

cashClearBtn?.addEventListener("click", () => {
  cashAmountReceived = 0;
  updateCashModalDisplay();
});

closeCashModal?.addEventListener("click", () => {
  closeCashPaymentModal();
});

cashConfirmBtn?.addEventListener("click", () => {
  const total = getCurrentOrderTotal();
  if (cashAmountReceived < total) return; // guarded by disabled state too

  const change = cashAmountReceived - total;
  finalizeSale("Cash", { received: cashAmountReceived, change });
  closeCashPaymentModal();
});

// === INIT ===
document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;

  renderMenu();
  renderPriceEditorIfAdmin();
  setupMenuCategoryTabs();
  setupOrderTypeTabs();

  const user = localStorage.getItem("mintchaUser");

  const cashierDisplay = document.getElementById("currentCashier");
  if (cashierDisplay) cashierDisplay.textContent = user;

  updateCart();

  proceedPayment.addEventListener("click", () => {
    if (cart.length === 0) return alert("Cart is empty!");
    paymentModal.style.display = "flex";
  });

  closePaymentModal.addEventListener("click", () => {
    paymentModal.style.display = "none";
  });

  // === Finalize a sale for any payment method ===
  // cashInfo (only for Cash) is { received, change } and gets stamped onto
  // the sale record + shown on the receipt so cashiers have a record of
  // what was tendered and how much change was given.
  function finalizeSale(method, cashInfo = null) {
    try {
      const customer = document.getElementById("customerName").value || "Walk-in";
      const note = document.getElementById("orderNote").value;
      const orderId = generateOrderId();
      const now = new Date();
      const options = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };
      const dateStr = now.toLocaleString("en-MY", options);

      const cashier = localStorage.getItem("mintchaUser") || "Unknown";
      const orderTypeLabel = activeOrderType === "delivery" ? "Delivery" : "Dine In";

      let subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
      const discountAmount = calculateDiscount(cart, appliedDiscount);
      const total = subtotal - discountAmount;

      const itemList = cart.map(i => `<div>${i.qty} × ${i.name} - RM${(i.qty * i.price).toFixed(2)}</div>`).join('');

      const cashReceiptBlock = cashInfo ? `
            <div><strong>Cash Received:</strong> RM${cashInfo.received.toFixed(2)}</div>
            <div><strong>Change Given:</strong> RM${cashInfo.change.toFixed(2)}</div>
      ` : "";

      receiptContent.innerHTML = `
        <div class="receipt-brand">🍃 Mintcha</div>
        <div class="receipt-header">
          <div><strong>${dateStr}</strong></div>
          <div>Order ID: ${orderId}</div>
          <div>Order Type: ${orderTypeLabel}</div>
          <div>Cashier: ${cashier}</div>
        </div>
        <div class="receipt-body">
          ${itemList}
          <div><em>Note:</em> ${note || '-'}</div>
          <div><strong>Discount:</strong> ${appliedDiscount || 'None'}</div>
          <div><strong>Payment:</strong> ${method}</div>
        </div>
        <div class="receipt-footer">
          <strong>Subtotal:</strong> RM${subtotal.toFixed(2)}<br>
          <strong>Discount:</strong> -RM${discountAmount.toFixed(2)}<br>
          <strong>Total:</strong> RM${total.toFixed(2)}<br>
          ${cashReceiptBlock}
          <div class="receipt-barcode"></div>
          <div>#TeamRumput VS #TeamMint 💚</div>
          <button id="closeReceiptModal">OK</button>
        </div>
      `;

      const sale = {
        id: orderId,
        date: dateStr,
        cashier,
        customer,
        note,
        orderType: orderTypeLabel,
        items: [...cart],
        paymentMethod: method,
        subtotal,
        discountType: appliedDiscount || "None",
        discountAmount,
        total,
        status: "Pending",
        // Only present for Cash payments — omitted entirely for QR/eWallet/Card
        ...(cashInfo ? { cashReceived: cashInfo.received, changeGiven: cashInfo.change } : {})
      };

      const allSales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");
      allSales.unshift(sale);
      localStorage.setItem("mintcha_sales", JSON.stringify(allSales));

      // === Deduct stock + log ingredient usage for this sale ===
      const depletedItems = deductStockForSaleAndLogUsage(cart);
      if (depletedItems.length) {
        showOrderToast(`⚠️ Now out of stock: ${depletedItems.join(", ")}`);
      }

      // Re-render the menu grid immediately so sold-out cards reflect the
      // post-sale stock levels for the next order.
      renderMenu(getCurrentAdminMode());

      document.getElementById("closeReceiptModal").onclick = () => {
        receiptModal.style.display = "none";
      };

      receiptModal.style.display = "flex";
    } catch (err) {
      console.error("Payment/save failed:", err);
      showOrderToast("Something went wrong saving the order");
    } finally {
      cart = [];
      resetDiscount();
      updateCart();
      document.getElementById("customerName").value = "";
      document.getElementById("orderNote").value = "";
      paymentModal.style.display = "none";
    }
  }

  paymentButtons.forEach(button => {
    button.addEventListener("click", () => {
      const method = button.dataset.method;

      // Cash needs the denomination/change modal first — it finalizes the
      // sale itself (via finalizeSale) once "Confirm Payment" is tapped.
      if (method === "Cash") {
        openCashModal();
        return;
      }

      finalizeSale(method);
    });
  });
});