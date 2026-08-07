// === Shared date/sort helpers ===
// These live at the top level (not inside DOMContentLoaded) so that BOTH the
// on-screen table AND the CSV/JSON export functions use the exact same logic.
// Previously these were declared only inside the DOMContentLoaded handler, so
// exportToCSV()/exportSalesToJSON() (which run outside that scope) fell back to
// whatever raw order the sales happened to be stored in — which is why the
// exported file's row order didn't match what was shown on screen.

// --- Safe Date Parser (Local-Time Aware) ---
function parseDateSafe(dateString) {
  if (!dateString) return null;
  const str = String(dateString).trim();

  const serialGuess = excelSerialToDate(str);
  if (serialGuess) return serialGuess;

  const isoParts = str.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s](\d{1,2}):(\d{2}):?(\d{2})?)?/
  );
  if (isoParts) {
    let [, y, m, d2, h, min, s] = isoParts;
    y = parseInt(y, 10);
    m = parseInt(m, 10) - 1;
    d2 = parseInt(d2, 10);
    h = h ? parseInt(h, 10) : 0;
    min = min ? parseInt(min, 10) : 0;
    s = s ? parseInt(s, 10) : 0;
    const localDate = new Date(y, m, d2, h, min, s);
    if (!isNaN(localDate.getTime())) return localDate;
  }

  const dtMatch = str.match(
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ ,T]*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM|am|pm))?)?/
  );
  if (dtMatch) {
    let [, day, month, year, hour, minute, second, ampm] = dtMatch;
    day = parseInt(day, 10);
    month = parseInt(month, 10) - 1;
    year = parseInt(year, 10);
    if (year < 100) year += 2000;

    hour = hour ? parseInt(hour, 10) : 0;
    minute = minute ? parseInt(minute, 10) : 0;
    second = second ? parseInt(second, 10) : 0;

    if (ampm) {
      const up = ampm.toUpperCase();
      if (up === "PM" && hour < 12) hour += 12;
      if (up === "AM" && hour === 12) hour = 0;
    }

    const localDate = new Date(year, month, day, hour, minute, second);
    if (!isNaN(localDate.getTime())) return localDate;
  }

  let d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  return null;
}

function sortSalesByDateDesc(sales) {
  return [...sales].sort((a, b) => {
    const da = parseDateSafe(a.date);
    const db = parseDateSafe(b.date);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db.getTime() - da.getTime();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const tableBody = document.getElementById("salesTableBody");
  const pageSize = 50;
  let currentPage = 1;
  let filteredSales = [];

  const user = localStorage.getItem("mintchaUser");
  const role = localStorage.getItem("mintchaRole");

  if (!user) {
    alert("You must log in to access this page.");
    window.location.href = "index.html";
    return;
  }

  const cashierDisplay = document.getElementById("currentCashier");
  if (cashierDisplay) cashierDisplay.textContent = user;

  if (role === "admin") {
    const exportControls = document.getElementById("exportControls");

    if (exportControls) {
      exportControls.innerHTML = "";

      const exportJSONBtn = document.createElement("button");
      exportJSONBtn.textContent = "📤 Export Sales (JSON)";
      exportJSONBtn.className = "admin-btn export-btn";
      exportJSONBtn.onclick = exportSalesToJSON;
      exportControls.appendChild(exportJSONBtn);

      const exportCSVBtn = document.createElement("button");
      exportCSVBtn.textContent = "📄 Export Sales (CSV)";
      exportCSVBtn.className = "admin-btn export-btn";
      exportCSVBtn.onclick = exportToCSV;
      exportControls.appendChild(exportCSVBtn);

      const importBtn = document.createElement("button");
      importBtn.textContent = "📥 Import Sales (XLSX)";
      importBtn.className = "admin-btn export-btn";
      importBtn.onclick = () => document.getElementById("importSalesInput").click();
      exportControls.appendChild(importBtn);

      const importInput = document.getElementById("importSalesInput");
      if (importInput) {
        importInput.value = "";
        importInput.onchange = handleImportFile;
      }

      const clearBtn = document.createElement("button");
      clearBtn.textContent = "🗑️ Clear All Sales";
      clearBtn.className = "admin-btn export-btn";
      clearBtn.style.backgroundColor = "#c62828";
      clearBtn.style.color = "#fff";
      clearBtn.onclick = () => {
        if (confirm("⚠️ Delete ALL sales data? This cannot be undone.")) {
          localStorage.removeItem("mintcha_sales");
          localStorage.removeItem("mintcha_sales_undo_backup");
          alert("✅ Sales cleared.");
          location.reload();
        }
      };
      exportControls.appendChild(clearBtn);

      const undoBtn = document.createElement("button");
      undoBtn.id = "undoImportBtn";
      undoBtn.textContent = "↩️ Undo Last Import";
      undoBtn.className = "admin-btn export-btn";
      undoBtn.style.backgroundColor = "#8a6d3b";
      undoBtn.style.color = "#fff";
      undoBtn.onclick = undoLastImport;
      exportControls.appendChild(undoBtn);
      refreshUndoButtonState();

      const reviewBtn = document.createElement("button");
      reviewBtn.id = "reviewConflictsBtn";
      reviewBtn.className = "admin-btn export-btn";
      reviewBtn.style.backgroundColor = "#b8860b";
      reviewBtn.style.color = "#fff";
      reviewBtn.onclick = openConflictsModal;
      exportControls.appendChild(reviewBtn);
      refreshConflictsButtonState();

      const fixDatesBtn = document.createElement("button");
      fixDatesBtn.id = "fixDatesBtn";
      fixDatesBtn.textContent = "🛠️ Fix Corrupted Dates";
      fixDatesBtn.className = "admin-btn export-btn";
      fixDatesBtn.style.backgroundColor = "#455a64";
      fixDatesBtn.style.color = "#fff";
      fixDatesBtn.onclick = fixCorruptedDates;
      exportControls.appendChild(fixDatesBtn);

      const repairMoneyBtn = document.createElement("button");
      repairMoneyBtn.id = "repairMoneyBtn";
      repairMoneyBtn.textContent = "🧮 Repair Missing Subtotal/Discount";
      repairMoneyBtn.className = "admin-btn export-btn";
      repairMoneyBtn.style.backgroundColor = "#455a64";
      repairMoneyBtn.style.color = "#fff";
      repairMoneyBtn.onclick = repairMissingSubtotals;
      exportControls.appendChild(repairMoneyBtn);

      const addSaleBtn = document.createElement("button");
      addSaleBtn.textContent = "➕ Add Sale (Manual Entry)";
      addSaleBtn.className = "admin-btn export-btn";
      addSaleBtn.onclick = openAddSaleModal;
      exportControls.appendChild(addSaleBtn);
      setupAddSaleModal();
    }
  }

  filteredSales = sortSalesByDateDesc(loadSales());
  populateCashierDropdown();
  renderSalesPage(currentPage);
  renderPagination();

  function loadSales() {
    return JSON.parse(localStorage.getItem("mintcha_sales") || "[]");
  }

  function populateCashierDropdown() {
    const cashierSelect = document.getElementById("filterCashier");
    if (!cashierSelect) return;

    const users = JSON.parse(localStorage.getItem("users") || "[]");
    const uniqueUsernames = [...new Set(users.map(u => u.username))];

    uniqueUsernames.forEach(username => {
      const option = document.createElement("option");
      option.value = username;
      option.textContent = username;
      cashierSelect.appendChild(option);
    });
  }

  function renderSalesPage(page) {
    tableBody.innerHTML = "";
    const start = (page - 1) * pageSize;
    const pageSales = filteredSales.slice(start, start + pageSize);

    pageSales.forEach((sale, index) => {
      if (!sale) return;

      let date = "-";
      let time = "-";
      const saleTime = parseDateSafe(sale.date);

      if (saleTime) {
        date = saleTime.toLocaleDateString();
        time = saleTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } else if (sale.date) {
        date = sale.date;
      }

      const now = new Date();
      const minutesElapsed = saleTime ? (now - saleTime) / 60000 : 0;
      const isRefunded = sale.status === "Refunded";
      const refundedClass = isRefunded ? "refunded-row" : "";

      let statusText = "";
      if (isRefunded) {
        statusText = "Refunded";
      } else if (minutesElapsed < 15) {
        statusText = "Preparing";
      } else {
        statusText = "Completed";
      }
      sale._derivedStatus = statusText;

      const row = document.createElement("tr");
      row.className = refundedClass;

      const itemList = (sale.items || [])
        .map(item => `<li>${item.qty} × ${item.name}</li>`)
        .join("");

      row.innerHTML = `
        <td>${start + index + 1}</td>
        <td>${sale.id || "-"}</td>
        <td>${date}</td>
        <td>${time}</td>
        <td>${sale.cashier || "-"}</td>
        <td>${sale.customer || "-"}</td>
        <td><ul>${itemList}</ul></td>
        <td>${sale.note || "-"}</td>
        <td>RM${parseFloat(sale.total || 0).toFixed(2)}</td>
        <td>${sale.paymentMethod || "-"}</td>
        <td>${sale.discountType || "None"}</td>
      `;

      const deleteCell = document.createElement("td");
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "🗑️ Delete";
      deleteBtn.className = "admin-btn delete-sale-btn";
      deleteBtn.style.backgroundColor = "#c62828";
      deleteBtn.style.color = "#fff";
      deleteBtn.onclick = () => {
        if (confirm(`Delete order ${sale.id}? This cannot be undone.`)) {
          const allSales = loadSales();
          const idx = allSales.findIndex(s => s.id === sale.id);
          if (idx !== -1) {
            allSales.splice(idx, 1);
            localStorage.setItem("mintcha_sales", JSON.stringify(allSales));
          }
          applyFilters();
        }
      };
      deleteCell.appendChild(deleteBtn);
      row.appendChild(deleteCell);

      const receiptCell = document.createElement("td");
      const printBtn = document.createElement("button");
      printBtn.textContent = "🖨️ Print";
      printBtn.className = "admin-btn print-receipt-btn";
      printBtn.onclick = () => viewReceipt(sale.id);
      receiptCell.appendChild(printBtn);
      row.appendChild(receiptCell);

      tableBody.appendChild(row);
    });
  }

  function renderPagination() {
    const totalPages = Math.ceil(filteredSales.length / pageSize);
    const pagination = document.getElementById("paginationControls");
    pagination.innerHTML = "";

    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement("button");
      btn.textContent = i;
      btn.className = i === currentPage ? "active" : "";
      btn.onclick = () => {
        currentPage = i;
        renderSalesPage(currentPage);
        renderPagination();
      };
      pagination.appendChild(btn);
    }
  }

  window.applyFilters = function () {
    const allSales = loadSales();

    const dateStart = document.getElementById("fromDate").value;
    const dateEnd = document.getElementById("toDate").value;
    const cashier = document.getElementById("filterCashier").value.trim().toLowerCase();
    const payment = document.getElementById("filterPayment").value.trim().toLowerCase();
    const status = document.getElementById("filterStatus").value.trim().toLowerCase();

    filteredSales = allSales.filter(sale => {
      const saleDateObj = parseDateSafe(sale.date);
      const dateStr = saleDateObj ? saleDateObj.toISOString().split("T")[0] : null;

      const matchStart = !dateStart || (dateStr && dateStr >= dateStart);
      const matchEnd = !dateEnd || (dateStr && dateStr <= dateEnd);
      const matchCashier = !cashier || (sale.cashier || "").toLowerCase() === cashier;
      const normalizedPayment = (sale.paymentMethod || "").toLowerCase().trim();
      const matchPayment = !payment || normalizedPayment === payment;

      let derivedStatus = sale._derivedStatus;
      if (!derivedStatus) {
        if ((sale.status || "").toLowerCase() === "refunded") {
          derivedStatus = "refunded";
        } else {
          const now = new Date();
          const minutesElapsed = saleDateObj ? (now - saleDateObj) / 60000 : 0;
          derivedStatus = minutesElapsed < 15 ? "preparing" : "completed";
        }
      }
      const matchStatus = !status || derivedStatus.toLowerCase() === status;

      return matchStart && matchEnd && matchCashier && matchPayment && matchStatus;
    });

    filteredSales = sortSalesByDateDesc(filteredSales);

    currentPage = 1;
    renderSalesPage(currentPage);
    renderPagination();
  };

  window.resetFilters = function () {
    document.getElementById("fromDate").value = "";
    document.getElementById("toDate").value = "";
    document.getElementById("filterCashier").value = "";
    document.getElementById("filterPayment").value = "";
    document.getElementById("filterStatus").value = "";

    filteredSales = sortSalesByDateDesc(loadSales());
    currentPage = 1;
    renderSalesPage(currentPage);
    renderPagination();
  };

  function fixCorruptedDates() {
    const allSales = loadSales();
    let fixedCount = 0;

    const repaired = allSales.map(sale => {
      const asDate = excelSerialToDate(sale.date);
      if (asDate) {
        fixedCount++;
        const pad = (n) => String(n).padStart(2, "0");
        return {
          ...sale,
          date: `${pad(asDate.getUTCDate())}/${pad(asDate.getUTCMonth() + 1)}/${asDate.getUTCFullYear()} ${pad(asDate.getUTCHours())}:${pad(asDate.getUTCMinutes())}`
        };
      }
      return sale;
    });

    if (fixedCount === 0) {
      alert("✅ No corrupted dates found — nothing to fix.");
      return;
    }

    if (!confirm(`Found ${fixedCount} sale(s) with a raw Excel serial number instead of a real date. Fix them now?`)) return;

    localStorage.setItem("mintcha_sales", JSON.stringify(repaired));
    alert(`✅ Fixed ${fixedCount} sale(s).`);
    location.reload();
  }

  function repairMissingSubtotals() {
    const allSales = loadSales();
    const menuItems = JSON.parse(localStorage.getItem("menuItems") || "[]");
    const priceMap = {};
    menuItems.forEach(m => { priceMap[m.name] = m.price || 0; });

    let fixedCount = 0;

    const repaired = allSales.map(sale => {
      const hasSubtotal = sale.subtotal !== undefined && sale.subtotal !== null && sale.subtotal !== "";
      const hasDiscountAmount = sale.discountAmount !== undefined && sale.discountAmount !== null && sale.discountAmount !== "";
      if (hasSubtotal && hasDiscountAmount) return sale;

      const total = parseFloat(sale.total || 0);

      let computedSubtotal = (sale.items || []).reduce((sum, item) => {
        const qty = item.qty || 0;
        const price = priceMap[item.name] ?? item.price ?? 0;
        return sum + qty * price;
      }, 0);

      computedSubtotal = Math.round(computedSubtotal * 100) / 100;

      let newSubtotal = sale.subtotal;
      let newDiscountAmount = sale.discountAmount;

      if (!hasSubtotal) {
        newSubtotal = computedSubtotal >= total ? computedSubtotal : total;
      }

      if (!hasDiscountAmount) {
        const base = newSubtotal ?? computedSubtotal;
        newDiscountAmount = sale.discountType === "Free"
          ? base
          : Math.max(0, Math.round((base - total) * 100) / 100);
      }

      if (newSubtotal !== sale.subtotal || newDiscountAmount !== sale.discountAmount) {
        fixedCount++;
        return { ...sale, subtotal: newSubtotal, discountAmount: newDiscountAmount };
      }
      return sale;
    });

    if (fixedCount === 0) {
      alert("✅ No sales are missing Subtotal/Discount Amount — nothing to fix.");
      return;
    }

    if (!confirm(`Found ${fixedCount} sale(s) missing Subtotal/Discount Amount (likely from an older import). Backfill them now using current menu prices as a best estimate?`)) return;

    localStorage.setItem("mintcha_sales", JSON.stringify(repaired));
    alert(`✅ Backfilled ${fixedCount} sale(s). Note: amounts are a best estimate based on current menu prices if the original per-item price wasn't available.`);
    location.reload();
  }

  function setupAddSaleModal() {
    const modal = document.getElementById("addSaleModal");
    if (!modal || modal.dataset.wired) return;
    modal.dataset.wired = "true";

    document.getElementById("closeAddSaleModal").onclick = closeAddSaleModal;
    document.getElementById("cancelManualSaleBtn").onclick = closeAddSaleModal;
    document.getElementById("addItemRowBtn").onclick = addItemRow;
    document.getElementById("saveManualSaleBtn").onclick = saveManualSale;

    document.getElementById("saleStatus").onchange = (e) => {
      const wrap = document.getElementById("refundReasonWrap");
      wrap.style.display = e.target.value === "Refunded" ? "block" : "none";
    };
  }

  function openAddSaleModal() {
    const modal = document.getElementById("addSaleModal");

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    document.getElementById("saleDateTime").value =
      `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    document.getElementById("saleCashier").value = user || "";
    document.getElementById("saleCustomer").value = "Walk-in";
    document.getElementById("saleNote").value = "";
    document.getElementById("salePayment").value = "Cash";
    document.getElementById("saleDiscountType").value = "None";
    document.getElementById("saleDiscountAmount").value = "0";
    document.getElementById("saleStatus").value = "Completed";
    document.getElementById("saleRefundReason").value = "";
    document.getElementById("refundReasonWrap").style.display = "none";

    const itemsContainer = document.getElementById("saleItemsContainer");
    itemsContainer.querySelectorAll(".sale-item-row").forEach((row, i) => {
      if (i > 0) row.remove();
    });
    const firstRow = itemsContainer.querySelector(".sale-item-row");
    if (firstRow) {
      firstRow.querySelector(".item-qty").value = 1;
      firstRow.querySelector(".item-name").value = "";
      firstRow.querySelector(".item-price").value = "";
    }

    modal.classList.remove("hidden");
    modal.style.display = "flex";
  }

  function closeAddSaleModal() {
    const modal = document.getElementById("addSaleModal");
    modal.classList.add("hidden");
    modal.style.display = "none";
  }

  function addItemRow() {
    const itemsContainer = document.getElementById("saleItemsContainer");
    const row = document.createElement("div");
    row.className = "sale-item-row";
    row.innerHTML = `
      <input type="number" min="1" class="item-qty" placeholder="Qty" value="1" />
      <input type="text" class="item-name" placeholder="Item name" />
      <input type="number" min="0" step="0.01" class="item-price" placeholder="Price (RM)" />
      <button type="button" class="remove-item-row-btn">✕</button>
    `;
    row.querySelector(".remove-item-row-btn").onclick = () => row.remove();
    itemsContainer.appendChild(row);
  }

  function generateNextOrderId() {
    return `ORD-${String(getNextOrderNumber()).padStart(4, "0")}`;
  }

  function saveManualSale() {
    const dateTimeValue = document.getElementById("saleDateTime").value;
    if (!dateTimeValue) {
      alert("Please set a date & time for this sale.");
      return;
    }

    const itemRows = document.querySelectorAll("#saleItemsContainer .sale-item-row");
    const items = [];
    itemRows.forEach(row => {
      const qty = parseInt(row.querySelector(".item-qty").value, 10) || 0;
      const name = row.querySelector(".item-name").value.trim();
      const price = parseFloat(row.querySelector(".item-price").value) || 0;
      if (name && qty > 0) {
        items.push({ qty, name, price });
      }
    });

    if (items.length === 0) {
      alert("Please add at least one item with a name and quantity.");
      return;
    }

    const subtotal = items.reduce((sum, i) => sum + i.qty * i.price, 0);
    const discountAmount = parseFloat(document.getElementById("saleDiscountAmount").value) || 0;
    const total = Math.max(0, subtotal - discountAmount);
    const status = document.getElementById("saleStatus").value;

    const sale = {
      id: generateNextOrderId(),
      date: dateTimeValue,
      cashier: document.getElementById("saleCashier").value.trim(),
      customer: document.getElementById("saleCustomer").value.trim() || "Walk-in",
      items,
      note: document.getElementById("saleNote").value.trim(),
      subtotal,
      discountType: document.getElementById("saleDiscountType").value.trim() || "None",
      discountAmount,
      total,
      paymentMethod: document.getElementById("salePayment").value,
      status,
      refundReason: status === "Refunded" ? document.getElementById("saleRefundReason").value.trim() : ""
    };

    const allSales = loadSales();
    allSales.push(sale);
    localStorage.setItem("mintcha_sales", JSON.stringify(allSales));

    closeAddSaleModal();
    alert(`✅ Sale ${sale.id} added for ${new Date(dateTimeValue).toLocaleString()}.`);
    window.applyFilters ? window.applyFilters() : (filteredSales = sortSalesByDateDesc(loadSales()), renderSalesPage(currentPage), renderPagination());
  }
});

// === Persistent Order ID counter ===
const ORDER_COUNTER_KEY = "mintcha_order_counter";

function getNextOrderNumber() {
  const stored = parseInt(localStorage.getItem(ORDER_COUNTER_KEY) || "0", 10);

  let maxFromSales = 0;
  try {
    const allSales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");
    allSales.forEach(s => {
      const m = String(s.id || "").match(/^ORD-(\d+)$/);
      if (m) maxFromSales = Math.max(maxFromSales, parseInt(m[1], 10));
    });
  } catch (err) { /* ignore */ }

  const next = Math.max(stored, maxFromSales) + 1;
  localStorage.setItem(ORDER_COUNTER_KEY, String(next));
  return next;
}

function ensureOrderCounterAtLeast(maxNum) {
  const current = parseInt(localStorage.getItem(ORDER_COUNTER_KEY) || "0", 10);
  if (maxNum > current) {
    localStorage.setItem(ORDER_COUNTER_KEY, String(maxNum));
  }
}

// === Excel serial date helper (shared by import + display + one-time repair) ===
function excelSerialToDate(value) {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return null;
  if (num < 20000 || num > 60000) return null;

  const utcDays = Math.floor(num - 25569);
  const utcMs = utcDays * 86400 * 1000;
  const dateInfo = new Date(utcMs);

  const fractionalDay = num - Math.floor(num) + 0.0000001;
  let totalSeconds = Math.floor(86400 * fractionalDay);
  const seconds = totalSeconds % 60;
  totalSeconds -= seconds;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;

  const d = new Date(Date.UTC(
    dateInfo.getUTCFullYear(),
    dateInfo.getUTCMonth(),
    dateInfo.getUTCDate(),
    hours,
    minutes,
    seconds
  ));
  return isNaN(d.getTime()) ? null : d;
}

function formatSaleDateForDisplay(value) {
  if (!value) return "-";
  const pad = (n) => String(n).padStart(2, "0");

  const asSerial = excelSerialToDate(value);
  if (asSerial) {
    return `${pad(asSerial.getUTCDate())}/${pad(asSerial.getUTCMonth() + 1)}/${asSerial.getUTCFullYear()} ${pad(asSerial.getUTCHours())}:${pad(asSerial.getUTCMinutes())}`;
  }

  const d = parseDateSafe(value);
  if (d) {
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return String(value);
}

// === CSV Export Function ===
function exportToCSV() {
  const sales = sortSalesByDateDesc(JSON.parse(localStorage.getItem("mintcha_sales") || "[]"));
  const rows = [
    ["Order ID", "Date", "Cashier", "Customer", "Items", "Subtotal", "Total", "Payment", "Discount Type", "Discount Amount", "Status", "Refund Reason"]
  ];

  sales.forEach(s => {
    const itemStr = (s.items || []).map(i => `${i.qty}x${i.name}`).join(" | ");
    const formattedDate = formatSaleDateForDisplay(s.date);

    rows.push([
      s.id,
      formattedDate,
      s.cashier,
      s.customer,
      itemStr,
      s.subtotal ?? "",
      s.total,
      s.paymentMethod,
      s.discountType || "None",
      s.discountAmount ?? "",
      s.status || "-",
      s.refundReason || "-"
    ]);
  });

  const csvContent = rows.map(r => r.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "mintcha_sales.csv";
  link.click();
}

// === JSON Export Function ===
function exportSalesToJSON() {
  const sales = sortSalesByDateDesc(JSON.parse(localStorage.getItem("mintcha_sales") || "[]"));
  const blob = new Blob([JSON.stringify(sales, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mintcha_sales_${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// === Undo Last Import ===
function undoLastImport() {
  const backupRaw = localStorage.getItem("mintcha_sales_undo_backup");
  if (!backupRaw) {
    alert("There's no recent import to undo.");
    return;
  }

  let backup;
  try {
    backup = JSON.parse(backupRaw);
  } catch (err) {
    console.error(err);
    alert("❌ The undo backup is corrupted and can't be restored.");
    return;
  }

  const when = backup.timestamp ? new Date(backup.timestamp).toLocaleString() : "the last import";
  if (!confirm(`Revert sales data back to how it was before your last import (${when})?`)) {
    return;
  }

  localStorage.setItem("mintcha_sales", JSON.stringify(backup.data || []));
  localStorage.removeItem("mintcha_sales_undo_backup");
  alert("✅ Reverted to the state before the last import.");
  location.reload();
}

function refreshUndoButtonState() {
  const btn = document.getElementById("undoImportBtn");
  if (!btn) return;
  const hasBackup = !!localStorage.getItem("mintcha_sales_undo_backup");
  btn.disabled = !hasBackup;
  btn.style.opacity = hasBackup ? "1" : "0.5";
  btn.style.cursor = hasBackup ? "pointer" : "not-allowed";
}

// === Review Import Conflicts ===
function loadConflicts() {
  try {
    return JSON.parse(localStorage.getItem("mintcha_sales_import_conflicts") || "[]");
  } catch (err) {
    return [];
  }
}

function saveConflicts(conflicts) {
  if (conflicts.length) {
    localStorage.setItem("mintcha_sales_import_conflicts", JSON.stringify(conflicts));
  } else {
    localStorage.removeItem("mintcha_sales_import_conflicts");
  }
  refreshConflictsButtonState();
}

function refreshConflictsButtonState() {
  const btn = document.getElementById("reviewConflictsBtn");
  if (!btn) return;
  const count = loadConflicts().length;
  btn.textContent = `⚠️ Review Conflicts (${count})`;
  btn.disabled = count === 0;
  btn.style.opacity = count ? "1" : "0.5";
  btn.style.cursor = count ? "pointer" : "not-allowed";
}

function renderConflictsTable() {
  const conflicts = loadConflicts();
  const tbody = document.getElementById("conflictsTableBody");
  const countLabel = document.getElementById("conflictsCount");
  if (countLabel) countLabel.textContent = conflicts.length;
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!conflicts.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No conflicts to review 🎉</td></tr>`;
    return;
  }

  conflicts.forEach(c => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${c.id}</td>
      <td>${formatSaleDateForDisplay(c.local.date)}<br><small>RM${parseFloat(c.local.total || 0).toFixed(2)}</small></td>
      <td>${formatSaleDateForDisplay(c.imported.date)}<br><small>RM${parseFloat(c.imported.total || 0).toFixed(2)}</small></td>
    `;

    const actionCell = document.createElement("td");
    actionCell.className = "conflict-actions";

    const keepBtn = document.createElement("button");
    keepBtn.textContent = "Keep Local";
    keepBtn.className = "admin-btn";
    keepBtn.onclick = () => resolveConflict(c.id, "keepLocal");

    const useImportedBtn = document.createElement("button");
    useImportedBtn.textContent = "Use Imported";
    useImportedBtn.className = "admin-btn export-btn";
    useImportedBtn.onclick = () => resolveConflict(c.id, "useImported");

    actionCell.appendChild(keepBtn);
    actionCell.appendChild(useImportedBtn);
    row.appendChild(actionCell);

    tbody.appendChild(row);
  });
}

function resolveConflict(id, action) {
  const conflicts = loadConflicts();
  const target = conflicts.find(c => c.id === id);
  if (!target) return;

  if (action === "useImported") {
    const allSales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");
    const idx = allSales.findIndex(s => s.id === id);
    if (idx !== -1) {
      allSales[idx] = { ...allSales[idx], ...target.imported };
    } else {
      allSales.push(target.imported);
    }
    localStorage.setItem("mintcha_sales", JSON.stringify(allSales));
  }

  const remaining = conflicts.filter(c => c.id !== id);
  saveConflicts(remaining);
  renderConflictsTable();

  if (window.applyFilters) window.applyFilters();
}

function resolveAllConflicts(action) {
  const conflicts = loadConflicts();
  if (!conflicts.length) return;

  const label = action === "useImported" ? "use the IMPORTED version for" : "keep the LOCAL version for";
  if (!confirm(`This will ${label} all ${conflicts.length} remaining conflicts. Continue?`)) return;

  if (action === "useImported") {
    const allSales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");
    const byId = new Map(allSales.map(s => [s.id, s]));
    conflicts.forEach(c => {
      byId.set(c.id, { ...(byId.get(c.id) || {}), ...c.imported });
    });
    localStorage.setItem("mintcha_sales", JSON.stringify(Array.from(byId.values())));
  }

  saveConflicts([]);
  renderConflictsTable();
  if (window.applyFilters) window.applyFilters();
}

function openConflictsModal() {
  const modal = document.getElementById("conflictsModal");
  if (!modal) return;

  if (!modal.dataset.wired) {
    modal.dataset.wired = "true";
    document.getElementById("closeConflictsModal").onclick = closeConflictsModal;
    document.getElementById("useImportedAllBtn").onclick = () => resolveAllConflicts("useImported");
    document.getElementById("keepLocalAllBtn").onclick = () => resolveAllConflicts("keepLocal");
  }

  renderConflictsTable();
  modal.classList.remove("hidden");
  modal.classList.add("is-open");
}

function closeConflictsModal() {
  const modal = document.getElementById("conflictsModal");
  modal.classList.add("hidden");
  modal.classList.remove("is-open");
}

// === Import Sales from XLSX ===
function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      if (!rows.length) {
        alert("The file is empty.");
        return;
      }

      const headerRow = rows[0].map(h => String(h).trim().toLowerCase());
      const dataRows = rows.slice(1);

      const col = (name) => headerRow.findIndex(h => h.includes(name));
      const idxId = col("order id");
      const idxDate = col("date");
      const idxCashier = col("cashier");
      const idxCustomer = col("customer");
      const idxItems = col("items");
      const idxSubtotal = col("subtotal");
      const idxTotal = col("total");
      const idxPayment = col("payment");
      const idxDiscountAmount = col("discount amount");
      const idxDiscount = headerRow.findIndex((h, i) => h.includes("discount") && i !== idxDiscountAmount);
      const idxStatus = col("status");
      const idxRefundReason = col("refund reason");

      if (idxId === -1 || idxTotal === -1) {
        alert("This file doesn't match the expected Sales export format (missing 'Order ID' / 'Total' columns).");
        return;
      }

      if (idxDate === -1) {
        const proceed = confirm(
          "⚠️ Couldn't find a 'Date' column in this file — every imported sale would end up with a blank date.\n\n" +
          "Check that your Date column header contains the word \"date\".\n\n" +
          "Continue importing anyway (dates will be blank)?"
        );
        if (!proceed) return;
      }

      if (idxSubtotal === -1 || idxDiscountAmount === -1) {
        const proceed = confirm(
          "⚠️ This file doesn't have 'Subtotal' / 'Discount Amount' columns (older export format).\n\n" +
          "Sales imported from it will show RM0.00 for Subtotal/Discount/Free Drinks Value on the Dashboard " +
          "until you run '🧮 Repair Missing Subtotal/Discount' afterwards.\n\n" +
          "Continue importing anyway?"
        );
        if (!proceed) return;
      }

      function excelValueToDateString(value) {
        if (value instanceof Date && !isNaN(value.getTime())) {
          const pad = (n) => String(n).padStart(2, "0");
          return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
        }

        const asSerial = excelSerialToDate(value);
        if (asSerial) {
          const pad = (n) => String(n).padStart(2, "0");
          return `${pad(asSerial.getUTCDate())}/${pad(asSerial.getUTCMonth() + 1)}/${asSerial.getUTCFullYear()} ${pad(asSerial.getUTCHours())}:${pad(asSerial.getUTCMinutes())}`;
        }

        return String(value ?? "").trim();
      }

      const existingSales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");

      localStorage.setItem("mintcha_sales_undo_backup", JSON.stringify({
        timestamp: new Date().toISOString(),
        data: existingSales
      }));

      const salesById = new Map(existingSales.map(s => [s.id, s]));

      let restored = 0;
      let updated = 0;
      const conflictRecords = [];
      let skippedBlank = 0;

      const parsedRows = [];
      dataRows.forEach(row => {
        if (!row || row.every(cell => cell === "" || cell === undefined)) return;

        const id = String(row[idxId] ?? "").trim();
        if (!id) { skippedBlank++; return; }

        const rawDateValue = idxDate !== -1 ? row[idxDate] : "";
        const importedDate = idxDate !== -1 ? excelValueToDateString(rawDateValue) : "";
        const sortDate = (rawDateValue instanceof Date && !isNaN(rawDateValue.getTime()))
          ? rawDateValue
          : (excelSerialToDate(rawDateValue) || new Date(importedDate) || null);

        const itemsRaw = String(row[idxItems] ?? "");
        const items = itemsRaw
          .split("|")
          .map(s => s.trim())
          .filter(Boolean)
          .map(part => {
            const m = part.match(/^(\d+)\s*x\s*(.+)$/i);
            return m
              ? { qty: parseInt(m[1], 10), name: m[2].trim(), price: 0 }
              : { qty: 1, name: part, price: 0 };
          });

        const subtotalVal = idxSubtotal !== -1 ? parseFloat(row[idxSubtotal]) : NaN;
        const discountAmountVal = idxDiscountAmount !== -1 ? parseFloat(row[idxDiscountAmount]) : NaN;

        parsedRows.push({
          _sortDate: sortDate,
          sale: {
            id,
            date: importedDate,
            cashier: String(row[idxCashier] ?? ""),
            customer: String(row[idxCustomer] ?? ""),
            items,
            ...(idxSubtotal !== -1 && !isNaN(subtotalVal) ? { subtotal: subtotalVal } : {}),
            total: parseFloat(row[idxTotal]) || 0,
            paymentMethod: String(row[idxPayment] ?? ""),
            discountType: idxDiscount !== -1 ? String(row[idxDiscount] ?? "None") : "None",
            ...(idxDiscountAmount !== -1 && !isNaN(discountAmountVal) ? { discountAmount: discountAmountVal } : {}),
            status: String(row[idxStatus] ?? ""),
            refundReason: idxRefundReason !== -1 ? String(row[idxRefundReason] ?? "") : ""
          }
        });
      });

      const groupsById = new Map();
      parsedRows.forEach(entry => {
        if (!groupsById.has(entry.sale.id)) groupsById.set(entry.sale.id, []);
        groupsById.get(entry.sale.id).push(entry);
      });

      const usedIds = new Set(existingSales.map(s => s.id));
      let renamedCount = 0;
      const duplicateIdsFound = [];

      const finalSales = [];
      groupsById.forEach((group, originalId) => {
        if (group.length === 1) {
          usedIds.add(originalId);
          finalSales.push(group[0].sale);
          return;
        }

        duplicateIdsFound.push(originalId);

        group.sort((a, b) => {
          const ta = a._sortDate ? a._sortDate.getTime() : 0;
          const tb = b._sortDate ? b._sortDate.getTime() : 0;
          return ta - tb;
        });

        group.forEach((entry, i) => {
          if (i === 0) {
            usedIds.add(originalId);
            finalSales.push(entry.sale);
            return;
          }
          let n = 2;
          let candidate = `${originalId}-b${n}`;
          while (usedIds.has(candidate)) {
            n++;
            candidate = `${originalId}-b${n}`;
          }
          usedIds.add(candidate);
          renamedCount++;
          finalSales.push({ ...entry.sale, id: candidate });
        });
      });

      finalSales.forEach(sale => {
        const existing = salesById.get(sale.id);

        if (!existing) {
          salesById.set(sale.id, sale);
          restored++;
        } else if (String(existing.date ?? "").trim() === sale.date) {
          salesById.set(sale.id, { ...existing, ...sale });
          updated++;
        } else {
          conflictRecords.push({ id: sale.id, local: existing, imported: sale });
        }
      });

      localStorage.setItem("mintcha_sales", JSON.stringify(Array.from(salesById.values())));

      let maxNumSeen = 0;
      salesById.forEach((s) => {
        const m = String(s.id || "").match(/^ORD-(\d+)/);
        if (m) maxNumSeen = Math.max(maxNumSeen, parseInt(m[1], 10));
      });
      ensureOrderCounterAtLeast(maxNumSeen);

      const priorConflictsRaw = localStorage.getItem("mintcha_sales_import_conflicts");
      let allConflicts = conflictRecords;
      if (priorConflictsRaw) {
        try {
          const prior = JSON.parse(priorConflictsRaw);
          const seen = new Set(conflictRecords.map(c => c.id));
          allConflicts = [...prior.filter(c => !seen.has(c.id)), ...conflictRecords];
        } catch (err) { /* ignore corrupted prior conflicts */ }
      }

      if (allConflicts.length) {
        localStorage.setItem("mintcha_sales_import_conflicts", JSON.stringify(allConflicts));
      } else {
        localStorage.removeItem("mintcha_sales_import_conflicts");
      }

      alert(
        `✅ Restored ${restored} sale(s), updated ${updated} matching sale(s).\n` +
        (renamedCount ? `🔀 ${renamedCount} sale(s) reused an Order ID from a different day (${duplicateIdsFound.slice(0, 5).join(", ")}${duplicateIdsFound.length > 5 ? ", ..." : ""}) — auto-renamed with a "-b" suffix so none were lost.\n` : "") +
        (allConflicts.length ? `⚠️ ${allConflicts.length} sale(s) need review — Order ID exists locally with a different date.\nClick "⚠️ Review Conflicts" to compare and resolve them.\n` : "") +
        ((idxSubtotal === -1 || idxDiscountAmount === -1) ? `🧮 This file lacked Subtotal/Discount Amount columns — run "🧮 Repair Missing Subtotal/Discount" to backfill those imported sales.\n` : "") +
        (skippedBlank ? `Skipped ${skippedBlank} blank row(s).\n` : "") +
        `If this wasn't the file you meant to import, click "↩️ Undo Last Import" to revert.`
      );
      location.reload();
    } catch (err) {
      console.error(err);
      alert("❌ Failed to read the file. Make sure it's a valid .xlsx file.");
    } finally {
      e.target.value = "";
    }
  };

  reader.readAsArrayBuffer(file);
}

// === viewReceipt ===
// FIX: was toggling classList("hidden"/"is-open") which wasn't actually
// showing the modal on this page. Switched to the same inline
// style.display toggle Order Management's receipt modal already uses
// successfully. Also the HTML no longer has a duplicate static close
// button outside #receiptContent — this function builds its own.
function viewReceipt(saleId) {
  const sales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");
  const sale = sales.find(s => s.id === saleId);
  if (!sale) return alert("Sale not found.");

  const receiptModal = document.getElementById("receiptModal");
  const receiptContent = document.getElementById("receiptContent");

  const itemList = (sale.items || [])
    .map(i => `<div>${i.qty} × ${i.name} - RM${(i.qty * i.price).toFixed(2)}</div>`)
    .join("");

  const refundBlock = sale.status === "Refunded"
    ? `<div class="refund-note"><strong>⚠ REFUNDED</strong><br>Reason: ${sale.refundReason || "-"}</div>`
    : "";

  receiptContent.innerHTML = `
    <span id="closeReceiptModal" class="close">&times;</span>
    <div class="receipt-brand">🍃 Mintcha</div>
    <div class="receipt-header">
      <div><strong>${formatSaleDateForDisplay(sale.date)}</strong></div>
      <div>Order ID: ${sale.id}</div>
      <div>Cashier: ${sale.cashier || "-"}</div>
      <div>Customer: ${sale.customer || "-"}</div>
    </div>
    <div class="receipt-body">
      ${itemList}
      <div><em>Note:</em> ${sale.note || "-"}</div>
      <div><strong>Discount:</strong> ${sale.discountType || "None"}</div>
      <div><strong>Payment:</strong> ${sale.paymentMethod || "-"}</div>
    </div>
    <div class="receipt-footer">
      <strong>Subtotal:</strong> RM${parseFloat(sale.subtotal || 0).toFixed(2)}<br>
      <strong>Discount:</strong> -RM${parseFloat(sale.discountAmount || 0).toFixed(2)}<br>
      <strong>Total:</strong> RM${parseFloat(sale.total || 0).toFixed(2)}<br>
      ${refundBlock}
      <div>#TeamRumput VS #TeamMint 💚</div>
      <button id="closeReceiptModalBtn">OK</button>
    </div>
  `;

  receiptModal.style.display = "flex";

  const closeModal = () => {
    receiptModal.style.display = "none";
  };
  document.getElementById("closeReceiptModalBtn").onclick = closeModal;
  document.getElementById("closeReceiptModal").onclick = closeModal;
}