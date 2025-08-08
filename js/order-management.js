// === Load Menu and Recipes ===
const fallbackMenu = [
  { name: "Mintcha Bloom", price: 15 },
  { name: "Ichigo Shortcha", price: 18 },
  { name: "Matcha Muse", price: 11 },
  { name: "Mint Majesty", price: 12 },
  { name: "Frosted Mintcha", price: 12 },
];

let sampleMenu = JSON.parse(localStorage.getItem("menuItems")) || fallbackMenu;

// === Cart State ===
let cart = [];

// === DOM Elements ===
const menuContainer = document.getElementById("menuItems");
const priceControls = document.getElementById("priceControls");
const cartList = document.getElementById("cartList");
const cartTotal = document.getElementById("cartTotal");
const proceedPayment = document.getElementById("proceedPayment");
const cancelOrder = document.getElementById("cancelOrder");
const paymentModal = document.getElementById("paymentModal");
const closePaymentModal = document.getElementById("closePaymentModal");
const paymentButtons = document.querySelectorAll(".payment-btn");
const receiptModal = document.getElementById("receiptModal");
const receiptContent = document.getElementById("receiptContent");

// === Render Menu Items ===
function renderMenu(editMode = false) {
  menuContainer.innerHTML = "";
  sampleMenu.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "menu-item";

    if (editMode) {
      div.innerHTML = `
        <strong>${item.name}</strong><br>
        <input type="number" min="0" step="0.1" value="${item.price.toFixed(2)}" data-index="${index}" class="price-input" /> RM
      `;
    } else {
      div.innerHTML = `<strong>${item.name}</strong><br>RM${item.price.toFixed(2)}`;
      div.onclick = () => addToCart(index);
    }

    menuContainer.appendChild(div);
  });
}

// === Render Admin Edit Button ===
function renderPriceEditorIfAdmin() {
  const role = localStorage.getItem("mintchaRole");
  if (role === "admin") {
    priceControls.innerHTML = `<button id="toggleEditPrices" class="edit-btn">🖊️ Edit Prices</button>`;
    let editMode = false;

    document.getElementById("toggleEditPrices").addEventListener("click", () => {
      editMode = !editMode;

      if (editMode) {
        renderMenu(true);
        document.getElementById("toggleEditPrices").textContent = "💾 Save Prices";
      } else {
        const inputs = document.querySelectorAll(".price-input");
        inputs.forEach(input => {
          const idx = input.dataset.index;
          const newPrice = parseFloat(input.value);
          if (!isNaN(newPrice)) sampleMenu[idx].price = newPrice;
        });
        localStorage.setItem("menuItems", JSON.stringify(sampleMenu));
        renderMenu(false);
        document.getElementById("toggleEditPrices").textContent = "🖊️ Edit Prices";
      }
    });
  }
}

// === Cart Functions ===
function addToCart(index) {
  const selected = sampleMenu[index];
  const existing = cart.find(i => i.name === selected.name);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ name: selected.name, price: selected.price, qty: 1 });
  }
  updateCart();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCart();
}

function increaseQty(index) {
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

function updateCart() {
  cartList.innerHTML = "";
  let total = 0;

  cart.forEach((item, idx) => {
    total += item.price * item.qty;
    const div = document.createElement("div");
    div.className = "cart-item";
    div.innerHTML = `
      <span>${item.name}</span>
      <div class="item-controls">
        <button onclick="decreaseQty(${idx})">-</button>
        <span>${item.qty}</span>
        <button onclick="increaseQty(${idx})">+</button>
        <button onclick="removeFromCart(${idx})">🗑️</button>
      </div>
    `;
    cartList.appendChild(div);
  });

  cartTotal.textContent = `RM${total.toFixed(2)}`;
}

// === Cancel Order ===
cancelOrder?.addEventListener("click", () => {
  cart = [];
  updateCart();
});

// === Order ID Generator ===
function generateOrderId() {
  const today = new Date().toISOString().split("T")[0];
  const key = `mintcha_order_id_${today}`;
  let currentNumber = parseInt(localStorage.getItem(key) || "0", 10);
  currentNumber++;
  localStorage.setItem(key, currentNumber);
  return `ORD-${String(currentNumber).padStart(4, "0")}`;
}

// === Proceed Payment Modal Open ===
proceedPayment?.addEventListener("click", () => {
  if (cart.length === 0) {
    alert("Cart is empty!");
    return;
  }
  paymentModal.style.display = "flex";
});

// === Close Payment Modal ===
closePaymentModal?.addEventListener("click", () => {
  paymentModal.style.display = "none";
});

// === Payment Processing ===
paymentButtons.forEach(button => {
  button.addEventListener("click", () => {
    const method = button.dataset.method;
    const customer = document.getElementById("customerName").value || "Walk-in";
    const note = document.getElementById("orderNote").value;
    const orderId = generateOrderId();
    const now = new Date();
    const dateStr = now.toISOString();
    const cashier = localStorage.getItem("mintchaUser") || "Unknown";
    const stock = JSON.parse(localStorage.getItem("mintcha_stock") || "[]");
    const menuItems = JSON.parse(localStorage.getItem("menuItems") || "[]");

    const missingItems = [];

    // === Check Ingredient Availability ===
    cart.forEach(cartItem => {
      const menuItem = menuItems.find(m => m.name === cartItem.name);
      const recipe = menuItem?.ingredients || [];

      recipe.forEach(ingredient => {
        const stockItem = stock.find(s => s.name === ingredient.name);
        const requiredQty = ingredient.qty * cartItem.qty;

        if (!stockItem) {
          missingItems.push(`${ingredient.name} (missing from stock)`);
        } else if (stockItem.quantity < requiredQty) {
          missingItems.push(`${ingredient.name} (needed: ${requiredQty}, available: ${stockItem.quantity})`);
        }
      });
    });

    if (missingItems.length) {
      alert("❌ Cannot complete the order. Missing ingredients:\n\n- " + missingItems.join("\n- "));
      return;
    }

    // === Deduct Ingredients ===
    cart.forEach(cartItem => {
      const menuItem = menuItems.find(m => m.name === cartItem.name);
      const recipe = menuItem?.ingredients || [];

      recipe.forEach(ingredient => {
        const stockItem = stock.find(s => s.name === ingredient.name);
        if (stockItem) {
          const usedQty = ingredient.qty * cartItem.qty;
          stockItem.quantity -= usedQty;
        }
      });
    });

    localStorage.setItem("mintcha_stock", JSON.stringify(stock));

    // === Track Daily Usage ===
    const usageData = JSON.parse(localStorage.getItem("mintcha_usage") || "{}");
    const todayKey = dateStr.split("T")[0];
    if (!usageData[todayKey]) usageData[todayKey] = {};

    cart.forEach(cartItem => {
      const menuItem = menuItems.find(m => m.name === cartItem.name);
      const recipe = menuItem?.ingredients || [];

      recipe.forEach(ingredient => {
        if (!usageData[todayKey][ingredient.name]) {
          usageData[todayKey][ingredient.name] = {
            total: 0,
            unit: ingredient.unit || "unit"
          };
        }
        usageData[todayKey][ingredient.name].total += ingredient.qty * cartItem.qty;
      });
    });

    localStorage.setItem("mintcha_usage", JSON.stringify(usageData));

    // === Generate Receipt ===
    const itemList = cart.map(i =>
      `<div>${i.qty} × ${i.name} - RM${(i.qty * i.price).toFixed(2)}</div>`
    ).join('');

    const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0).toFixed(2);

    receiptContent.innerHTML = `
      <div class="receipt-brand">🍃 Mintcha</div>
      <div class="receipt-header">
        <div><strong>${dateStr}</strong></div>
        <div>Order ID: ${orderId}</div>
        <div>Cashier: ${cashier}</div>
      </div>
      <div class="receipt-body">
        ${itemList}
        <div><em>Note:</em> ${note || '-'}</div>
        <div><strong>Payment:</strong> ${method}</div>
      </div>
      <div class="receipt-footer">
        <strong>Total:</strong> RM${total}<br>
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
      items: [...cart],
      paymentMethod: method,
      total,
      status: "Pending"
    };

    const allSales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");
    allSales.unshift(sale);
    localStorage.setItem("mintcha_sales", JSON.stringify(allSales));

    cart = [];
    updateCart();
    document.getElementById("customerName").value = "";
    document.getElementById("orderNote").value = "";
    paymentModal.style.display = "none";

    document.getElementById("closeReceiptModal").onclick = () => {
      receiptModal.style.display = "none";
    };

    receiptModal.style.display = "flex";
  });
});

// === Init ===
document.addEventListener("DOMContentLoaded", () => {
  renderMenu();
  renderPriceEditorIfAdmin();

  const user = localStorage.getItem("mintchaUser");
  if (!user) {
    alert("You must log in to access this page.");
    window.location.href = "index.html";
    return;
  }

  const cashierDisplay = document.getElementById("currentCashier");
  if (cashierDisplay) cashierDisplay.textContent = user;
});
