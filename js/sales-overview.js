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

  // Admin Export / Import Buttons
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

      // === Import Sales (XLSX) ===
      const importBtn = document.createElement("button");
      importBtn.textContent = "📥 Import Sales (XLSX)";
      importBtn.className = "admin-btn export-btn";
      importBtn.onclick = () => document.getElementById("importSalesInput").click();
      exportControls.appendChild(importBtn);

      const importInput = document.getElementById("importSalesInput");
      if (importInput) {
        importInput.value = ""; // reset so re-selecting the same file still fires "change"
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
          // Deliberately NOT removing mintcha_order_counter here — the next Order ID
          // generated after a clear should keep counting up from where it left off,
          // not reset to ORD-0001 and risk colliding with sales from a previous day.
          alert("✅ Sales cleared.");
          location.reload();
        }
      };
      exportControls.appendChild(clearBtn);

      // === Undo Last Import ===
      const undoBtn = document.createElement("button");
      undoBtn.id = "undoImportBtn";
      undoBtn.textContent = "↩️ Undo Last Import";
      undoBtn.className = "admin-btn export-btn";
      undoBtn.style.backgroundColor = "#8a6d3b";
      undoBtn.style.color = "#fff";
      undoBtn.onclick = undoLastImport;
      exportControls.appendChild(undoBtn);
      refreshUndoButtonState();

      // === Review Import Conflicts ===
      const reviewBtn = document.createElement("button");
      reviewBtn.id = "reviewConflictsBtn";
      reviewBtn.className = "admin-btn export-btn";
      reviewBtn.style.backgroundColor = "#b8860b";
      reviewBtn.style.color = "#fff";
      reviewBtn.onclick = openConflictsModal;
      exportControls.appendChild(reviewBtn);
      refreshConflictsButtonState();

      // === Fix Corrupted Dates (repairs sales already saved with raw Excel serial numbers) ===
      const fixDatesBtn = document.createElement("button");
      fixDatesBtn.id = "fixDatesBtn";
      fixDatesBtn.textContent = "🛠️ Fix Corrupted Dates";
      fixDatesBtn.className = "admin-btn export-btn";
      fixDatesBtn.style.backgroundColor = "#455a64";
      fixDatesBtn.style.color = "#fff";
      fixDatesBtn.onclick = fixCorruptedDates;
      exportControls.appendChild(fixDatesBtn);

      // === Add Sale (Manual Entry) — re-key past sales with a custom date/time ===
      const addSaleBtn = document.createElement("button");
      addSaleBtn.textContent = "➕ Add Sale (Manual Entry)";
      addSaleBtn.className = "admin-btn export-btn";
      addSaleBtn.onclick = openAddSaleModal;
      exportControls.appendChild(addSaleBtn);
      setupAddSaleModal();
    }
  }

  // === Load initial data
  filteredSales = loadSales();
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

  // --- Safe Date Parser (Local-Time Aware) ---
  function parseDateSafe(dateString) {
    if (!dateString) return null;

    // 0️⃣ Bare Excel serial number stored as a string/number (e.g. "46333.868...")
    //    Catches dates that were corrupted by a prior import before this fix existed.
    const serialGuess = excelSerialToDate(dateString);
    if (serialGuess) return serialGuess;

    // 1️⃣ Try built-in parser first (handles ISO)
    let d = new Date(dateString);
    if (!isNaN(d.getTime())) return d;

    // 2️⃣ Try DD/MM/YYYY or DD-MM-YYYY (with optional time)
    const dtMatch = dateString.match(
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

      // Create local time date
      const localDate = new Date(year, month, day, hour, minute, second);
      if (!isNaN(localDate.getTime())) return localDate;
    }

    // 3️⃣ Try ISO-like YYYY-MM-DD HH:MM
    const isoParts = dateString.match(
      /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s](\d{1,2}):(\d{2}):?(\d{2})?)?/
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

    return null;
  }

  // === Render Sales Table ===
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
        time = saleTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); // HH:MM only
      } else if (sale.date) {
        date = sale.date;
      }

      const now = new Date();
      const minutesElapsed = saleTime ? (now - saleTime) / 60000 : 0;
      const isRefunded = sale.status === "Refunded";
      const refundedClass = isRefunded ? "refunded-row" : "";

      // Still computed so the Status filter dropdown keeps working,
      // even though we no longer render a Status column/badge.
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

      // === Delete column (replaces Status) ===
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

      // === Receipt column ===
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

    filteredSales = loadSales();
    currentPage = 1;
    renderSalesPage(currentPage);
    renderPagination();
  };

  // === One-time repair for sales already saved with raw Excel serial-number dates ===
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

  // === Manual Sale Entry (Admin) ===
  function setupAddSaleModal() {
    const modal = document.getElementById("addSaleModal");
    if (!modal || modal.dataset.wired) return; // only wire event listeners once
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

    // Reset fields to defaults every time it's opened
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

    // Reset item rows to a single blank row
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
      date: dateTimeValue, // e.g. "2026-07-14T13:30" — parseDateSafe/new Date() reads this natively
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
    window.applyFilters ? window.applyFilters() : (filteredSales = loadSales(), renderSalesPage(currentPage), renderPagination());
  }
});

// === Persistent Order ID counter ===
// Stored under its own key so "Clear All Sales" (which only removes
// mintcha_sales / mintcha_sales_undo_backup) never resets it. This is what
// stops a fresh testing day from generating a brand-new ORD-0001 that
// collides with an ID already used on a previous day.
const ORDER_COUNTER_KEY = "mintcha_order_counter";

function getNextOrderNumber() {
  const stored = parseInt(localStorage.getItem(ORDER_COUNTER_KEY) || "0", 10);

  // Safety net for the very first run on a browser that already has sales
  // but has never set this counter before — don't let it dip below what's
  // already sitting in mintcha_sales.
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

// Called after import/repair so the counter never falls behind IDs that
// arrived from a file (e.g. a backup with higher order numbers than
// anything currently stored locally).
function ensureOrderCounterAtLeast(maxNum) {
  const current = parseInt(localStorage.getItem(ORDER_COUNTER_KEY) || "0", 10);
  if (maxNum > current) {
    localStorage.setItem(ORDER_COUNTER_KEY, String(maxNum));
  }
}

// === Excel serial date helper (shared by import + display + one-time repair) ===
// Converts a raw Excel date serial number (e.g. 46333.868055555555, meaning
// "days since Dec 30 1899, plus a fractional day for the time") into a JS Date (UTC).
// Returns null if the value isn't a plausible serial number.
function excelSerialToDate(value) {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return null;
  // Guard rails: real serials for "recent-ish" dates roughly fall in this range
  // (~1954 to ~2064). This avoids misreading small numbers like "5" or "2026" as dates.
  if (num < 20000 || num > 60000) return null;
  // Also require it to actually look like a serial (has the full string of the original
  // number, not just something that happens to parse as a float in range) —
  // calling code already restricts this to the "date" column, so this check is enough.

  const utcDays = Math.floor(num - 25569); // 25569 = days between 1899-12-30 and 1970-01-01
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

// Formats any stored date value (real date string, ISO string, or a corrupted
// raw Excel serial number) into a friendly DD/MM/YYYY HH:MM string for display.
function formatSaleDateForDisplay(value) {
  if (!value) return "-";
  const asSerial = excelSerialToDate(value);
  if (asSerial) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(asSerial.getUTCDate())}/${pad(asSerial.getUTCMonth() + 1)}/${asSerial.getUTCFullYear()} ${pad(asSerial.getUTCHours())}:${pad(asSerial.getUTCMinutes())}`;
  }
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return String(value);
}

// === CSV Export Function ===
function exportToCSV() {
  const sales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");
  const rows = [
    ["Order ID", "Date", "Cashier", "Customer", "Items", "Total", "Payment", "Discount", "Status", "Refund Reason"]
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
      s.total,
      s.paymentMethod,
      s.discountType || "None",
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
  const sales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");
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
  // "keepLocal" just dismisses the conflict without touching mintcha_sales

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
      // cellDates:true makes Excel's native date/time cells come back as real JS Date
      // objects instead of raw serial numbers, so we can format them correctly below.
      const workbook = XLSX.read(data, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      // header:1 gives raw rows so we control the column mapping ourselves
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      if (!rows.length) {
        alert("The file is empty.");
        return;
      }

      // Expect the same column order as exportToCSV():
      // Order ID, Date, Cashier, Customer, Items, Total, Payment, Discount, Status, Refund Reason
      const headerRow = rows[0].map(h => String(h).trim().toLowerCase());
      const dataRows = rows.slice(1);

      // Substring match instead of exact match — tolerates headers like "Order Date",
      // "Date/Time", trailing punctuation, etc. instead of requiring the literal word.
      const col = (name) => headerRow.findIndex(h => h.includes(name));
      const idxId = col("order id");
      const idxDate = col("date");
      const idxCashier = col("cashier");
      const idxCustomer = col("customer");
      const idxItems = col("items");
      const idxTotal = col("total");
      const idxPayment = col("payment");
      const idxDiscount = col("discount");
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

      // Converts a raw imported cell value into the same date-string format used elsewhere.
      // Handles: real Date objects (from Excel-formatted date cells), bare Excel serial
      // numbers (from cells stored as plain numbers, no date format applied), and plain
      // text/ISO strings.
      function excelValueToDateString(value) {
        if (value instanceof Date && !isNaN(value.getTime())) {
          const pad = (n) => String(n).padStart(2, "0");
          return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
        }

        // Fallback: bare Excel serial number (cell wasn't formatted as a date in the source file)
        const asSerial = excelSerialToDate(value);
        if (asSerial) {
          const pad = (n) => String(n).padStart(2, "0");
          return `${pad(asSerial.getUTCDate())}/${pad(asSerial.getUTCMonth() + 1)}/${asSerial.getUTCFullYear()} ${pad(asSerial.getUTCHours())}:${pad(asSerial.getUTCMinutes())}`;
        }

        return String(value ?? "").trim();
      }

      const existingSales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");

      // Snapshot current data BEFORE applying the import, so it can be undone.
      // This only keeps the single most recent pre-import state (one level of undo).
      localStorage.setItem("mintcha_sales_undo_backup", JSON.stringify({
        timestamp: new Date().toISOString(),
        data: existingSales
      }));

      // Map by ID so we can restore/update in place
      const salesById = new Map(existingSales.map(s => [s.id, s]));

      let restored = 0;   // ID didn't exist locally (was deleted) -> brought back
      let updated = 0;    // ID exists locally, date matches -> safe refresh
      const conflictRecords = []; // ID exists locally, but date differs -> needs manual review
      let skippedBlank = 0;

      // --- Pass 1: parse every row into a sale object first (don't merge yet). ---
      // We need to see the WHOLE file before merging, because the same Order ID can appear
      // more than once in a single export (e.g. IDs got reused after a "Clear All Sales" on a
      // different day). If we merged row-by-row, later rows would silently overwrite earlier
      // ones with the same ID before we ever got a chance to notice the collision.
      const parsedRows = [];
      dataRows.forEach(row => {
        if (!row || row.every(cell => cell === "" || cell === undefined)) return;

        const id = String(row[idxId] ?? "").trim();
        if (!id) { skippedBlank++; return; }

        const rawDateValue = idxDate !== -1 ? row[idxDate] : "";
        const importedDate = idxDate !== -1 ? excelValueToDateString(rawDateValue) : "";
        // Keep a real Date around (when we have one) purely so duplicate rows for the
        // same ID can be sorted chronologically in Pass 2 below.
        const sortDate = (rawDateValue instanceof Date && !isNaN(rawDateValue.getTime()))
          ? rawDateValue
          : (excelSerialToDate(rawDateValue) || new Date(importedDate) || null);

        // Parse "2xMatcha Muse | 1xAmericano" back into item objects
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

        parsedRows.push({
          _sortDate: sortDate,
          sale: {
            id,
            date: importedDate,
            cashier: String(row[idxCashier] ?? ""),
            customer: String(row[idxCustomer] ?? ""),
            items,
            total: parseFloat(row[idxTotal]) || 0,
            paymentMethod: String(row[idxPayment] ?? ""),
            discountType: String(row[idxDiscount] ?? "None"),
            status: String(row[idxStatus] ?? ""),
            refundReason: idxRefundReason !== -1 ? String(row[idxRefundReason] ?? "") : ""
          }
        });
      });

      // --- Pass 2: find Order IDs that appear more than once in THIS file, and rename ---
      // every occurrence after the first (oldest kept as the original ID) so no sale gets
      // silently dropped just because a previous testing day already used that same ID.
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

        // Oldest first, so the earliest sale keeps the "real" ID and matches normally
        // against whatever's already stored locally under that ID.
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
          // Every later occurrence of this reused ID becomes its own distinct sale
          // instead of overwriting/being overwritten by the others.
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

      // --- Pass 3: merge the (now-unique) parsed sales into local storage as before ---
      finalSales.forEach(sale => {
        const existing = salesById.get(sale.id);

        if (!existing) {
          // Not on record locally (e.g. it was deleted) -> restore it from the backup
          salesById.set(sale.id, sale);
          restored++;
        } else if (String(existing.date ?? "").trim() === sale.date) {
          // Same ID, same date -> genuinely the same sale, safe to refresh
          // Preserve fields the export doesn't carry (subtotal, discountAmount, item prices)
          salesById.set(sale.id, { ...existing, ...sale });
          updated++;
        } else {
          // Same ID but different date -> could mean this ID was reused by a newer sale,
          // OR it could mean the local copy is the one that's wrong (e.g. corrupted by an
          // earlier bad import). We can't tell which, so don't guess — leave local data as-is
          // and record it for manual review instead of silently dropping it.
          conflictRecords.push({ id: sale.id, local: existing, imported: sale });
        }
      });

      localStorage.setItem("mintcha_sales", JSON.stringify(Array.from(salesById.values())));

      // Make sure future manually-entered Order IDs never collide with the highest
      // number that just came in from this file.
      let maxNumSeen = 0;
      salesById.forEach((s) => {
        const m = String(s.id || "").match(/^ORD-(\d+)/);
        if (m) maxNumSeen = Math.max(maxNumSeen, parseInt(m[1], 10));
      });
      ensureOrderCounterAtLeast(maxNumSeen);

      // Merge with any conflicts already pending review from a previous import
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
        (skippedBlank ? `Skipped ${skippedBlank} blank row(s).\n` : "") +
        `If this wasn't the file you meant to import, click "↩️ Undo Last Import" to revert.`
      );
      location.reload();
    } catch (err) {
      console.error(err);
      alert("❌ Failed to read the file. Make sure it's a valid .xlsx file.");
    } finally {
      e.target.value = ""; // allow re-selecting same file later
    }
  };

  reader.readAsArrayBuffer(file);
}

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

  receiptModal.classList.remove("hidden");
  receiptModal.classList.add("is-open");

  const closeModal = () => {
    receiptModal.classList.add("hidden");
    receiptModal.classList.remove("is-open");
  };
  document.getElementById("closeReceiptModalBtn").onclick = closeModal;
  document.getElementById("closeReceiptModal").onclick = closeModal;
}