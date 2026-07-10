let sampleMenu = JSON.parse(localStorage.getItem("menuItems")) || [];

// === Cart & Discount State ===
let cart = [];
let appliedDiscount = null;

// === Reorder (drag & drop) state ===
let dragSrcIndex = null;

// === Menu card color tagging ===
// 5 preset colors only, kept simple — no custom color picker needed.
const CARD_COLORS = [
  { name: "Rose",    value: "#ffcdd2" },
  { name: "Amber",   value: "#ffe0b2" },
  { name: "Mint",    value: "#c8e6c9" },
  { name: "Sky",     value: "#b3e5fc" },
  { name: "Lavender",value: "#d1c4e9" },
];

// === DOM Elements ===
const menuContainer = document.getElementById("menuItems");
const priceControls = document.getElementById("priceControls");
const menuEmptyState = document.getElementById("menuEmptyState");
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

// === Render Menu Items ===
// mode: "view" (default, click-to-add) | "editPrices" | "reorder"
// Legacy callers pass a boolean (true = editPrices, false/undefined = view) — normalized below.
function renderMenu(mode = "view") {
  if (mode === true) mode = "editPrices";
  if (mode === false || mode == null) mode = "view";

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
    div.dataset.index = index;
    div.title = item.name;

    // Apply saved color tag, if any
    if (item.color) {
      div.style.backgroundColor = item.color;
    }

    if (mode === "editPrices") {
      div.innerHTML = `
        <strong>${item.name}</strong>
        <span class="price-tag">RM <input
              type="number"
              step="0.01"
              value="${parseFloat(item.price).toFixed(2)}"
              class="price-input"
              data-index="${index}"
              aria-label="Price for ${item.name}"></span>
      `;
    } else if (mode === "reorder") {
      div.classList.add("draggable-item");
      div.draggable = true;
      div.innerHTML = `
        <span class="drag-handle" title="Drag to reorder">⠿</span>
        <strong>${item.name}</strong>
        <span class="price-tag">RM${parseFloat(item.price).toFixed(2)}</span>
      `;
      attachDragHandlers(div, index);
    } else {
      div.innerHTML = `
        <strong>${item.name}</strong>
        <span class="price-tag">RM${parseFloat(item.price).toFixed(2)}</span>
      `;
      div.tabIndex = 0;
      div.setAttribute("role", "button");
      div.setAttribute("aria-label", `Add ${item.name}, RM${parseFloat(item.price).toFixed(2)}, to cart`);
      div.onclick = () => addToCart(index, div);
      div.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          addToCart(index, div);
        }
      };
    }

    // Color tag button available in every mode — small dot in the corner
    attachColorPicker(div, index);

    menuContainer.appendChild(div);
  });
}

// === Color tag picker ===
// Adds a small colored dot button to a menu card. Clicking it opens a
// popover of 5 preset swatches (+ "Clear") so any user can manually tag
// a card's color — purely visual, doesn't touch price/order data.
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
    e.stopPropagation(); // don't trigger addToCart on the card behind it
    e.preventDefault();

    // Close any other open popover first
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

    // "Clear" option to remove the tag
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

    // Close popover if clicking anywhere else on the page
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

  // Re-render in whatever mode is currently active, so admin edit/reorder
  // modes keep working after a color change
  const editBtn = document.getElementById("toggleEditPrices");
  const reorderBtn = document.getElementById("toggleReorder");
  if (editBtn?.classList.contains("active-mode")) {
    renderMenu("editPrices");
  } else if (reorderBtn?.classList.contains("active-mode")) {
    renderMenu("reorder");
  } else {
    renderMenu("view");
  }
  showOrderToast(colorValue ? "Card color updated" : "Card color cleared");
}

// === Drag & Drop reorder handlers ===
// Attaches HTML5 drag events to a single menu-item div so it can be
// dragged onto another item to swap its position in sampleMenu.
// Note: native HTML5 drag & drop does not fire on touch devices
// (tablets/phones) — this works with mouse/trackpad input.
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
// The two modes are mutually exclusive: entering one disables the other's
// button so an admin can't edit prices mid-drag or vice versa.
function renderPriceEditorIfAdmin() {
  const role = localStorage.getItem("mintchaRole");
  if (role !== "admin") return;

  priceControls.innerHTML = `
    <span class="admin-tools-label">Admin tools</span>
    <button id="toggleEditPrices" class="edit-btn">🖊️ Edit Prices</button>
    <button id="toggleReorder" class="edit-btn">🔀 Reorder Menu</button>
  `;

  let currentMode = "view";
  const editBtn = document.getElementById("toggleEditPrices");
  const reorderBtn = document.getElementById("toggleReorder");

  editBtn.addEventListener("click", () => {
    if (currentMode === "editPrices") {
      const inputs = document.querySelectorAll(".price-input");
      inputs.forEach((input) => {
        const idx = input.dataset.index;
        const newPrice = parseFloat(input.value);
        if (!isNaN(newPrice)) sampleMenu[idx].price = newPrice;
      });
      localStorage.setItem("menuItems", JSON.stringify(sampleMenu));

      currentMode = "view";
      editBtn.textContent = "🖊️ Edit Prices";
      editBtn.classList.remove("active-mode");
      reorderBtn.disabled = false;
      renderMenu("view");
      showOrderToast("Prices saved");
    } else {
      currentMode = "editPrices";
      editBtn.textContent = "💾 Save Prices";
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
  const existing = cart.find(i => i.name === selected.name);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ name: selected.name, price: selected.price, qty: 1 });
  }
  updateCart();

  if (cardEl) {
    cardEl.classList.remove("just-added");
    void cardEl.offsetWidth; // restart animation if clicked again quickly
    cardEl.classList.add("just-added");
  }
  showOrderToast(`${selected.name} added to cart`);
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

// === Discount Calculation (single source of truth) ===
// Returns the discount amount (RM) for a given cart + discount label.
// Used by both the live cart preview (updateCart) and the payment/receipt flow,
// so the two can never drift out of sync.
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
        // Give away the cheapest eligible units for free, one per 3 items bought,
        // without discounting more units of a line than it actually has.
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
    case "Buy 2 Get 10% Off":
      if (totalQty >= 2) discountAmount = subtotal * 0.10;
      break;
  }

  if (discountAmount > subtotal) discountAmount = subtotal;

  return discountAmount;
}

// === Update Cart ===
function updateCart() {
  // An empty cart can never legitimately carry a discount. This is a safety
  // net so a stray failure elsewhere (e.g. an error thrown before
  // resetDiscount() runs during checkout) can never leave a "phantom"
  // discount showing on an empty cart.
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
    // Inline style wins any specificity tie against ".hidden" vs
    // ".cart-summary-row" in the page's own <style> block, so this can
    // never be visually overridden by the cascade.
    summaryDiscountRow.style.display = "flex";
  } else {
    summaryDiscountRow.classList.add("hidden");
    summaryDiscountRow.style.display = "none";
    // Also clear the stale text so nothing lingers if this row is ever
    // shown again by a future bug.
    summaryDiscount.textContent = "-RM0.00";
    discountLabelEl.textContent = "";
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
      case "20off":
        appliedDiscount = "20% Off";
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
// Guarded with a confirmation since this is a destructive, one-click action
// sitting right next to "Proceed to Payment".
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

      // Wrapped in try/finally: if anything below throws (bad localStorage
      // data, quota errors, etc.), the cart and discount still get cleared
      // in the `finally` block so a failed save can never leave a stale
      // discount/cart stuck on screen for the next order.
      try {
        const customer = document.getElementById("customerName").value || "Walk-in";
        const note = document.getElementById("orderNote").value;
        const orderId = generateOrderId();
        const now = new Date();
        const options = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };
        const dateStr = now.toLocaleString("en-MY", options);

        const cashier = localStorage.getItem("mintchaUser") || "Unknown";

        // Totals — calculated via the shared calculateDiscount() function so the
        // receipt/sale total always matches what was shown in the cart preview.
        let subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
        const discountAmount = calculateDiscount(cart, appliedDiscount);
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

        document.getElementById("closeReceiptModal").onclick = () => {
          receiptModal.style.display = "none";
        };

        receiptModal.style.display = "flex";
      } catch (err) {
        console.error("Payment/save failed:", err);
        showOrderToast("Something went wrong saving the order");
      } finally {
        // Always runs, whether the sale saved successfully or not — this is
        // what guarantees the discount can never survive past checkout.
        cart = [];
        resetDiscount();
        updateCart();
        document.getElementById("customerName").value = "";
        document.getElementById("orderNote").value = "";
        paymentModal.style.display = "none";
      }
    });
  });
});