let sampleMenu = JSON.parse(localStorage.getItem("menuItems")) || [];

// === Cart & Discount State ===
let cart = [];
let appliedDiscount = null; // Store current discount type

// === DOM Elements ===
const menuContainer = document.getElementById("menuItems");
const priceControls = document.getElementById("priceControls");
const menuEmptyState = document.getElementById("menuEmptyState");
const cartList = document.getElementById("cartList");
const cartEmptyState = document.getElementById("cartEmptyState");
const cartTotal = document.getElementById("cartTotal");
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
const removeDiscountBtn = document.getElementById("removeDiscountBtn"); // optional remove discount button

// === Render Menu Items ===
function renderMenu(editMode = false) {
  sampleMenu = JSON.parse(localStorage.getItem("menuItems")) || [];
  menuContainer.innerHTML = "";

  if (!sampleMenu.length) {
    menuEmptyState.classList.remove("hidden");
    return;
  }
  menuEmptyState.classList.add("hidden");

  sampleMenu.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "menu-item";
    div.innerHTML = `<strong>${item.name}</strong><br>RM${parseFloat(item.price).toFixed(2)}`;
    div.onclick = () => addToCart(index);
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

// === Update Cart ===
function updateCart() {
  cartList.innerHTML = "";
  let subtotal = 0;

  if (!cart.length) {
    cartEmptyState.classList.remove("hidden");
  } else {
    cartEmptyState.classList.add("hidden");
  }

  cart.forEach((item, idx) => {
    subtotal += item.price * item.qty;
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

  let discountAmount = 0;
  if (appliedDiscount === "5% Off") discountAmount = subtotal * 0.05;
if (appliedDiscount === "10% Off") discountAmount = subtotal * 0.10;
if (appliedDiscount === "Student Discount (10%)") discountAmount = subtotal * 0.10; // ✅ new
if (appliedDiscount === "Buy 1 Free 1") {
  let sortedItems = [...cart].sort((a, b) => a.price - b.price);
  let freeCount = Math.floor(cart.reduce((sum, i) => sum + i.qty, 0) / 2);
  for (let i = 0; i < freeCount; i++) discountAmount += sortedItems[i % sortedItems.length].price;
}


  const total = subtotal - discountAmount;

  if (appliedDiscount) {
    cartTotal.textContent = `Subtotal: RM${subtotal.toFixed(2)} | Discount: ${appliedDiscount} (-RM${discountAmount.toFixed(2)}) | Total: RM${total.toFixed(2)}`;
  } else {
    cartTotal.textContent = `Total: RM${total.toFixed(2)}`;
  }
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
    const totalQtyInCart = cart.reduce((sum, i) => sum + i.qty, 0);

    if (type === "buy1free1") {
      if (totalQtyInCart < 2) {
        alert("❌ Buy 1 Free 1 requires at least 2 items in the cart.");
        return;
      }
      appliedDiscount = "Buy 1 Free 1";
    } else if (type === "5off") {
      appliedDiscount = "5% Off";
    } else if (type === "10off") {
      appliedDiscount = "10% Off";
    } else if (type === "student10") {
      appliedDiscount = "Student Discount (10%)";  // ✅ new discount
      } else if (type === "hari3") {
  appliedDiscount = "Hari Malaysia – RM3 Off";  // ✅ new
    } else {
      appliedDiscount = null;
    }

    updateCart();
    alert(`${appliedDiscount} applied!`);
    discountModal.style.display = "none";
  });
});

removeDiscountBtn?.addEventListener("click", () => {
  if (!appliedDiscount) {
    alert("No discount applied.");
    return;
  }
  appliedDiscount = null;
  updateCart();
  alert("Discount removed.");
  discountModal.style.display = "flex";
});

// === Cancel Order ===
cancelOrder?.addEventListener("click", () => {
  cart = [];
  resetDiscount();
  updateCart();
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

// === INIT ===
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

  updateCart();

  // ✅ All payment-related event listeners are added AFTER DOM is loaded
  proceedPayment.addEventListener("click", () => {
    if (cart.length === 0) {
      alert("Cart is empty!");
      return;
    }
    paymentModal.style.display = "flex";
  });

  closePaymentModal.addEventListener("click", () => {
    paymentModal.style.display = "none";
  });

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

      // Check stock
      const missingItems = [];
      cart.forEach(cartItem => {
        const menuItem = menuItems.find(m => m.name === cartItem.name);
        const recipe = menuItem?.ingredients || [];
        recipe.forEach(ingredient => {
          const stockItem = stock.find(s => s.name === ingredient.name);
          const requiredQty = ingredient.qty * cartItem.qty;
          if (!stockItem) missingItems.push(`${ingredient.name} (missing from stock)`);
          else if (stockItem.quantity < requiredQty)
            missingItems.push(`${ingredient.name} (needed: ${requiredQty}, available: ${stockItem.quantity})`);
        });
      });

      if (missingItems.length) {
        alert("❌ Cannot complete the order. Missing ingredients:\n\n- " + missingItems.join("\n- "));
        return;
      }

      // Deduct Ingredients
      cart.forEach(cartItem => {
        const menuItem = menuItems.find(m => m.name === cartItem.name);
        const recipe = menuItem?.ingredients || [];
        recipe.forEach(ingredient => {
          const stockItem = stock.find(s => s.name === ingredient.name);
          if (stockItem) stockItem.quantity -= ingredient.qty * cartItem.qty;
        });
      });
      localStorage.setItem("mintcha_stock", JSON.stringify(stock));

      // Track Daily Usage
      const usageData = JSON.parse(localStorage.getItem("mintcha_usage") || "{}");
      const todayKey = dateStr.split("T")[0];
      if (!usageData[todayKey]) usageData[todayKey] = {};
      cart.forEach(cartItem => {
        const menuItem = menuItems.find(m => m.name === cartItem.name);
        const recipe = menuItem?.ingredients || [];
        recipe.forEach(ingredient => {
          if (!usageData[todayKey][ingredient.name]) usageData[todayKey][ingredient.name] = { total: 0, unit: ingredient.unit || "unit" };
          usageData[todayKey][ingredient.name].total += ingredient.qty * cartItem.qty;
        });
      });
      localStorage.setItem("mintcha_usage", JSON.stringify(usageData));

      // Totals
      let subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
      let discountAmount = 0;
if (appliedDiscount === "5% Off") discountAmount = subtotal * 0.05;
if (appliedDiscount === "10% Off") discountAmount = subtotal * 0.10;
if (appliedDiscount === "Student Discount (10%)") discountAmount = subtotal * 0.10; // ✅ new rule
if (appliedDiscount === "Buy 1 Free 1") {
  let sortedItems = [...cart].sort((a, b) => a.price - b.price);
  let freeCount = Math.floor(cart.reduce((sum, i) => sum + i.qty, 0) / 2);
  for (let i = 0; i < freeCount; i++) {
    discountAmount += sortedItems[i % sortedItems.length].price;
  }
}

      let total = subtotal - discountAmount;

      // Receipt
      const itemList = cart.map(i => `<div>${i.qty} × ${i.name} - RM${(i.qty * i.price).toFixed(2)}</div>`).join('');
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
          <div><strong>Discount:</strong> ${appliedDiscount || 'None'}</div>
          <div><strong>Payment:</strong> ${method}</div>
        </div>
        <div class="receipt-footer">
          <strong>Subtotal:</strong> RM${subtotal.toFixed(2)}<br>
          <strong>Discount:</strong> -RM${discountAmount.toFixed(2)}<br>
          <strong>Total:</strong> RM${total.toFixed(2)}<br>
          <div class="receipt-barcode"></div>
          <div>#TeamRumput VS #TeamMint 💚</div>
          <button id="closeReceiptModal">OK</button>
        </div>
      `;

      // Save sale
      const sale = {
        id: orderId,
        date: dateStr,
        cashier,
        customer,
        note,
        items: [...cart],
        paymentMethod: method,
        subtotal,
        discountType: appliedDiscount || "None",
        discountAmount,
        total,
        status: "Pending"
      };

      const allSales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");
      allSales.unshift(sale);
      localStorage.setItem("mintcha_sales", JSON.stringify(allSales));

      cart = [];
      resetDiscount();
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
});
