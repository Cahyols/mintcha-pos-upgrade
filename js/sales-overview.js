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
    const allSales = loadSales();
    let maxNum = 0;
    allSales.forEach(s => {
      const m = String(s.id || "").match(/^ORD-(\d+)$/);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    });
    return `ORD-${String(maxNum + 1).padStart(4, "0")}`;
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

// === CSV Export Function ===
function exportToCSV() {
  const sales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");
  const rows = [
    ["Order ID", "Date", "Cashier", "Customer", "Items", "Total", "Payment", "Discount", "Status", "Refund Reason"]
  ];

  sales.forEach(s => {
    const itemStr = (s.items || []).map(i => `${i.qty}x${i.name}`).join(" | ");
    const d = new Date(s.date);
    const formattedDate = isNaN(d)
      ? s.date
      : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

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

// === Import Sales from XLSX ===
function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
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

      const col = (name) => headerRow.indexOf(name);
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
      let conflicts = 0;  // ID exists locally, but date differs -> likely ID reused by a different sale, skipped
      let skippedBlank = 0;

      dataRows.forEach(row => {
        if (!row || row.every(cell => cell === "" || cell === undefined)) return;

        const id = String(row[idxId] ?? "").trim();
        if (!id) { skippedBlank++; return; }

        const importedDate = String(row[idxDate] ?? "").trim();

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

        const sale = {
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
        };

        const existing = salesById.get(id);

        if (!existing) {
          // Not on record locally (e.g. it was deleted) -> restore it from the backup
          salesById.set(id, sale);
          restored++;
        } else if (String(existing.date ?? "").trim() === importedDate) {
          // Same ID, same date -> genuinely the same sale, safe to refresh
          // Preserve fields the export doesn't carry (subtotal, discountAmount, item prices)
          salesById.set(id, { ...existing, ...sale });
          updated++;
        } else {
          // Same ID but different date -> this ID was likely reused by a newer sale.
          // Don't overwrite current data with the old backup record.
          conflicts++;
        }
      });

      localStorage.setItem("mintcha_sales", JSON.stringify(Array.from(salesById.values())));
      alert(
        `✅ Restored ${restored} sale(s), updated ${updated} matching sale(s).\n` +
        (conflicts ? `⚠️ ${conflicts} sale(s) skipped — Order ID exists locally with a different date (likely reused by a newer sale).\n` : "") +
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
      <div><strong>${sale.date}</strong></div>
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

  const closeModal = () => (receiptModal.style.display = "none");
  document.getElementById("closeReceiptModalBtn").onclick = closeModal;
  document.getElementById("closeReceiptModal").onclick = closeModal;
}