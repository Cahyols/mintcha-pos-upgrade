let sampleMenu = JSON.parse(localStorage.getItem("menuItems")) || [];

// === Cart & Discount State ===
let cart = [];
let appliedDiscount = null;

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
const removeDiscountBtn = document.getElementById("removeDiscountBtn");

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

    if (editMode) {
      div.innerHTML = `
        <strong>${item.name}</strong><br>
        RM <input 
              type="number" 
              step="0.01" 
              value="${parseFloat(item.price).toFixed(2)}" 
              class="price-input" 
              data-index="${index}">
      `;
    } else {
      div.innerHTML = `<strong>${item.name}</strong><br>RM${parseFloat(item.price).toFixed(2)}`;
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
  const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);

  switch (appliedDiscount) {
    case "5% Off":
      discountAmount = subtotal * 0.05;
      break;
    case "10% Off":
      discountAmount = subtotal * 0.10;
      break;
    case "Student Discount (10%)":
      discountAmount = subtotal * 0.10;
      break;
    case "Buy 2 Free 1":
  if (totalQty >= 3) {
    const sortedItems = [...cart].sort((a, b) => a.price - b.price);
    const freeCount = Math.floor(totalQty / 3);

    for (let i = 0; i < freeCount; i++) {
      discountAmount += sortedItems[i % sortedItems.length].price;
    }
  }
  break;
    case "Buy 2 Get 10% Off":
      if (totalQty >= 2) discountAmount = subtotal * 0.10;
      break;
    case "IG RM1 Off":
      discountAmount = 1;
      break;
    case "TikTok RM1 Off":
      discountAmount = 1;
      break;
    case "Med Sos RM2 Off":
      discountAmount = 2;
      break;
  }

  if (discountAmount > subtotal) discountAmount = subtotal;

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
    const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);

    switch (type) {
      case "buy2free1":
  if (totalQty < 3)
    return alert("❌ Buy 2 Free 1 requires at least 3 items.");
  appliedDiscount = "Buy 2 Free 1";
  break;
      case "buy2get10":
        if (totalQty < 2) return alert("❌ Buy 2 Get 10% Off requires at least 2 items.");
        appliedDiscount = "Buy 2 Get 10% Off";
        break;
      case "5off":
        appliedDiscount = "5% Off";
        break;
      case "10off":
        appliedDiscount = "10% Off";
        break;
      case "student10":
        appliedDiscount = "Student Discount (10%)";
        break;
      case "ig1":
        appliedDiscount = "IG RM1 Off";
        break;
      case "tiktok1":
        appliedDiscount = "TikTok RM1 Off";
        break;
      case "medsos2":
        appliedDiscount = "Med Sos RM2 Off";
        break;
    }

    updateCart();
    alert(`${appliedDiscount} applied!`);
    discountModal.style.display = "none";
  });
});

removeDiscountBtn?.addEventListener("click", () => {
  if (!appliedDiscount) return alert("No discount applied.");
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

  proceedPayment.addEventListener("click", () => {
    if (cart.length === 0) return alert("Cart is empty!");
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
      const options = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };
      const dateStr = now.toLocaleString("en-MY", options);

      const cashier = localStorage.getItem("mintchaUser") || "Unknown";
      const stock = JSON.parse(localStorage.getItem("mintcha_stock") || "[]");
      const menuItems = JSON.parse(localStorage.getItem("menuItems") || "[]");

      // Totals
      let subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
      let discountAmount = 0;
      const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);

      switch (appliedDiscount) {
        case "5% Off": discountAmount = subtotal * 0.05; break;
        case "10% Off": discountAmount = subtotal * 0.10; break;
        case "Student Discount (10%)": discountAmount = subtotal * 0.10; break;
        case "Buy 2 Free 1":
  if (totalQty >= 3) {
    const sortedItems = [...cart].sort((a, b) => a.price - b.price);
    const freeCount = Math.floor(totalQty / 3);

    for (let i = 0; i < freeCount; i++) {
      discountAmount += sortedItems[i % sortedItems.length].price;
    }
  }
  break;
        case "Buy 2 Get 10% Off":
          if (totalQty >= 2) discountAmount = subtotal * 0.10;
          break;
        case "IG RM1 Off": discountAmount = 1; break;
        case "TikTok RM1 Off": discountAmount = 1; break;
        case "Med Sos RM2 Off": discountAmount = 2; break;
      }

      if (discountAmount > subtotal) discountAmount = subtotal;
      const total = subtotal - discountAmount;

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
