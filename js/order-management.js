let sampleMenu = JSON.parse(localStorage.getItem("menuItems")) || [];
let cart = [];
let appliedDiscount = null;

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
const discountBtn = document.getElementById("discountBtn");
const discountModal = document.getElementById("discountModal");
const closeDiscountModal = document.getElementById("closeDiscountModal");
const discountOptions = document.querySelectorAll(".discount-option");
const removeDiscountBtn = document.getElementById("removeDiscountBtn");

// === MENU RENDER ===
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
        RM <input type="number" step="0.01" value="${parseFloat(item.price).toFixed(2)}"
        class="price-input" data-index="${index}">
      `;
    } else {
      div.innerHTML = `<strong>${item.name}</strong><br>RM${parseFloat(item.price).toFixed(2)}`;
      div.onclick = () => addToCart(index);
    }

    menuContainer.appendChild(div);
  });
}

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

// === CART HANDLERS ===
function addToCart(index) {
  const selected = sampleMenu[index];
  const existing = cart.find(i => i.name === selected.name);
  if (existing) existing.qty++;
  else cart.push({ name: selected.name, price: selected.price, qty: 1 });
  updateCart();
}

function removeFromCart(i) { cart.splice(i, 1); updateCart(); }
function increaseQty(i) { cart[i].qty++; updateCart(); }
function decreaseQty(i) { cart[i].qty > 1 ? cart[i].qty-- : cart.splice(i, 1); updateCart(); }

function updateCart() {
  cartList.innerHTML = "";
  let subtotal = 0;

  if (!cart.length) cartEmptyState.classList.remove("hidden");
  else cartEmptyState.classList.add("hidden");

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
  if (appliedDiscount === "10% Off" || appliedDiscount === "Student Discount (10%)") discountAmount = subtotal * 0.10;
  if (appliedDiscount === "Buy 1 Free 1") {
    let sortedItems = [...cart].sort((a, b) => a.price - b.price);
    let freeCount = Math.floor(cart.reduce((s, i) => s + i.qty, 0) / 2);
    for (let i = 0; i < freeCount; i++) discountAmount += sortedItems[i % sortedItems.length].price;
  }

  const total = subtotal - discountAmount;
  cartTotal.textContent = appliedDiscount
    ? `Subtotal: RM${subtotal.toFixed(2)} | Discount: ${appliedDiscount} (-RM${discountAmount.toFixed(2)}) | Total: RM${total.toFixed(2)}`
    : `Total: RM${total.toFixed(2)}`;
}

// === DISCOUNTS ===
discountBtn?.addEventListener("click", () => discountModal.style.display = "flex");
closeDiscountModal?.addEventListener("click", () => discountModal.style.display = "none");

discountOptions.forEach(button => {
  button.addEventListener("click", () => {
    if (appliedDiscount) return alert(`A discount (${appliedDiscount}) is already applied! Remove it first.`);
    const type = button.dataset.type;
    const qty = cart.reduce((sum, i) => sum + i.qty, 0);
    if (type === "buy1free1" && qty < 2) return alert("❌ Buy 1 Free 1 requires at least 2 items.");
    appliedDiscount =
      type === "buy1free1" ? "Buy 1 Free 1" :
      type === "5off" ? "5% Off" :
      type === "10off" ? "10% Off" :
      type === "student10" ? "Student Discount (10%)" : null;
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

cancelOrder?.addEventListener("click", () => {
  cart = [];
  appliedDiscount = null;
  updateCart();
});

// === PAYMENT ===
function generateOrderId() {
  const today = new Date().toISOString().split("T")[0];
  const key = `mintcha_order_id_${today}`;
  let num = parseInt(localStorage.getItem(key) || "0", 10);
  num++;
  localStorage.setItem(key, num);
  return `ORD-${String(num).padStart(4, "0")}`;
}

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
    if (!cart.length) return alert("Cart is empty!");
    paymentModal.style.display = "flex";
  });

  closePaymentModal.addEventListener("click", () => paymentModal.style.display = "none");

  paymentButtons.forEach(button => {
    button.addEventListener("click", () => {
      const method = button.dataset.method;
      const customer = document.getElementById("customerName").value || "Walk-in";
      const note = document.getElementById("orderNote").value;
      const orderId = generateOrderId();
      const now = new Date();
      const options = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };
      const dateStr = now.toLocaleString("en-MY", options);
      const cashier = user;

      let subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
      let discountAmount = 0;
      if (appliedDiscount === "5% Off") discountAmount = subtotal * 0.05;
      if (appliedDiscount === "10% Off" || appliedDiscount === "Student Discount (10%)") discountAmount = subtotal * 0.10;
      if (appliedDiscount === "Buy 1 Free 1") {
        let sortedItems = [...cart].sort((a, b) => a.price - b.price);
        let freeCount = Math.floor(cart.reduce((s, i) => s + i.qty, 0) / 2);
        for (let i = 0; i < freeCount; i++) discountAmount += sortedItems[i % sortedItems.length].price;
      }

      const total = subtotal - discountAmount;

      const order = {
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
      allSales.unshift(order);
      localStorage.setItem("mintcha_sales", JSON.stringify(allSales));

      cart = [];
      appliedDiscount = null;
      updateCart();
      document.getElementById("customerName").value = "";
      document.getElementById("orderNote").value = "";
      paymentModal.style.display = "none";

      // === Call receipt.js function
      generateReceipt(order);
    });
  });
});
