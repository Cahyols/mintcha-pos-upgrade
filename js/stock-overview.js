// === Shared: convert a stock item's on-hand quantity into a target unit ===
// Returns null if no safe conversion is possible (unit mismatch with no
// matching conversionUnit set on the stock item).
// NOTE: kept in sync with the identical copy in dashboard.js.
function convertStockQtyToUnit(stockItem, targetUnit) {
  const stockUnit = String(stockItem.unit || "").trim().toLowerCase();
  const target = String(targetUnit || "").trim().toLowerCase();
  if (!target) return null;
  if (stockUnit === target) return parseFloat(stockItem.quantity);

  const convUnit = String(stockItem.conversionUnit || "").trim().toLowerCase();
  const convValue = parseFloat(stockItem.conversionValue);
  if (convUnit && convUnit === target && !isNaN(convValue)) {
    return parseFloat(stockItem.quantity) * convValue;
  }
  return null; // units don't match and no usable conversion is set
}

// === Shared: for a stock item, find the recipe that would run out FIRST,
// and how many of that drink could still be made from what's on hand. ===
// NOTE: kept in sync with the identical copy in dashboard.js.
function getServingsInfo(stockItem, menuData) {
  let minServings = null;
  let limitingDrink = null;

  (menuData || []).forEach(drink => {
    (drink.ingredients || []).forEach(ing => {
      if (String(ing.name || "").trim().toLowerCase() !== String(stockItem.name || "").trim().toLowerCase()) return;
      if (!ing.qty || ing.qty <= 0) return;

      const availableQty = convertStockQtyToUnit(stockItem, ing.unit);
      if (availableQty === null) return; // unit mismatch, can't compute for this recipe

      const servings = Math.floor(availableQty / ing.qty);
      if (minServings === null || servings < minServings) {
        minServings = servings;
        limitingDrink = drink.name;
      }
    });
  });

  return { minServings, limitingDrink };
}

// === Shared: full low-stock check — quantity threshold OR serving threshold ===
// NOTE: kept in sync with the identical copy in dashboard.js.
function getStockLowInfo(item, menuData) {
  const threshold = parseFloat(item.lowThreshold);
  const qty = parseFloat(item.quantity);
  const qtyLow = !isNaN(threshold) && !isNaN(qty) && qty <= threshold;

  let servingsLow = false;
  let minServings = null;
  let limitingDrink = null;

  const servingThreshold = parseFloat(item.lowServingThreshold);
  if (!isNaN(servingThreshold)) {
    const info = getServingsInfo(item, menuData);
    minServings = info.minServings;
    limitingDrink = info.limitingDrink;
    if (minServings !== null && minServings <= servingThreshold) {
      servingsLow = true;
    }
  }

  return { isLow: qtyLow || servingsLow, qtyLow, servingsLow, minServings, limitingDrink };
}

function loadMenu() {
  return JSON.parse(localStorage.getItem("menuItems") || "[]");
}

document.addEventListener("DOMContentLoaded", () => {
  const user = localStorage.getItem("mintchaUser");
  const role = localStorage.getItem("mintchaRole");

  const stockFormSection = document.getElementById("stockFormSection");
  const stockTableBody = document.getElementById("stockTableBody");
  const stockForm = document.getElementById("addStockForm");
  const formTitle = document.getElementById("formTitle");
  const submitBtn = document.getElementById("submitStockBtn");

  const nameInput = document.getElementById("stockName");
  const qtyInput = document.getElementById("stockQty");
  const unitInput = document.getElementById("stockUnit");
  const conversionUnitInput = document.getElementById("conversionUnit");
  const conversionValueInput = document.getElementById("conversionValue");
  const lowThresholdInput = document.getElementById("lowThreshold");
  const lowServingThresholdInput = document.getElementById("lowServingThreshold");

  const cashierDisplay = document.getElementById("currentCashier");
  if (cashierDisplay && user) cashierDisplay.textContent = user;

  // === Admin Features (Form & Export Buttons) ===
  if (role === "admin") {
    stockFormSection?.classList.remove("hidden");

    const adminExportContainer = document.getElementById("adminExportContainer");
    if (adminExportContainer && !adminExportContainer.dataset.buttonsInjected) {
      adminExportContainer.dataset.buttonsInjected = "true"; // prevent duplication

      // Export button
      const exportBtn = document.createElement("button");
      exportBtn.id = "exportStockBtn";
      exportBtn.className = "export-btn";
      exportBtn.textContent = "📤 Export Inventory (CSV)";
      exportBtn.addEventListener("click", exportStockAsCSV);

      // Import button
      const importBtn = document.createElement("button");
      importBtn.id = "importStockBtn";
      importBtn.className = "import-btn";
      importBtn.textContent = "📥 Import Inventory (CSV)";
      importBtn.addEventListener("click", () => importInput.click());

      // File input
      const importInput = document.createElement("input");
      importInput.type = "file";
      importInput.accept = ".csv";
      importInput.id = "importStockFile";
      importInput.style.display = "none";
      importInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (event) {
          importStockFromCSV(event.target.result);
        };
        reader.readAsText(file);
      });

      adminExportContainer.appendChild(exportBtn);
      adminExportContainer.appendChild(importBtn);
      adminExportContainer.appendChild(importInput);
    }
  }

  let isEditing = false;
  let editIndex = null;

  function showToast(message, type = "info") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => toast.classList.remove("show"), 3000);
  }

  function loadStock() {
    return JSON.parse(localStorage.getItem("mintcha_stock") || "[]");
  }

  function saveStock(stockList) {
    localStorage.setItem("mintcha_stock", JSON.stringify(stockList));
  }

  // Coerces through parseFloat rather than requiring typeof === "number",
  // so a threshold/quantity that ended up stored as a string (CSV import,
  // restored backup, manual localStorage edit) still gets picked up
  // instead of silently being skipped. Kept in sync with the identical
  // check in dashboard.js's getLowStockItems().
  function isItemLow(item) {
    return getStockLowInfo(item, loadMenu()).isLow;
  }

  window.getLowStockItems = function () {
    const stock = loadStock();
    return stock.filter(isItemLow);
  };

  function renderStockTable() {
    const stockList = loadStock();
    const menuData = loadMenu();
    const showOnlyLow = document.getElementById("toggleLowStockOnly")?.checked;
    stockTableBody.innerHTML = "";

    stockList.forEach((item, index) => {
      const lowInfo = getStockLowInfo(item, menuData);
      const isLow = lowInfo.isLow;
      if (showOnlyLow && !isLow) return;

      const row = document.createElement("tr");
      if (isLow) row.classList.add("low-stock");

      const conversion = item.conversionUnit && item.conversionValue
        ? `1 ${item.unit} = ${item.conversionValue} ${item.conversionUnit}`
        : "-";

      // Two independent warning badges can appear together: one for raw
      // quantity dropping below lowThreshold, one for "can only make N
      // more drinks" dropping below lowServingThreshold. Either, both, or
      // neither can be true at once.
      let warningHtml = "";
      if (lowInfo.qtyLow) {
        warningHtml += ` <span style="color:red;" title="Below quantity threshold">⚠️</span>`;
      }
      if (lowInfo.servingsLow) {
        const drinkLabel = lowInfo.limitingDrink ? ` ${lowInfo.limitingDrink}` : "";
        warningHtml += ` <span style="color:#e65100;" title="Only ${lowInfo.minServings}${drinkLabel} left in stock">🥤 ~${lowInfo.minServings}</span>`;
      }

      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${item.name}</td>
        <td>${item.quantity}${warningHtml}</td>
        <td>${item.unit}</td>
        <td>${conversion}</td>
        <td>
          ${role === "admin" ? `
            <button onclick="editStock(${index})" class="edit-btn">✏️ Edit</button>
            <button onclick="deleteStock(${index})" class="delete-btn">🗑️ Delete</button>
          ` : "-"}
        </td>
      `;
      stockTableBody.appendChild(row);
    });
  }

  document.getElementById("toggleLowStockOnly")?.addEventListener("change", renderStockTable);

  stockForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    const quantity = parseFloat(qtyInput.value);
    const unit = unitInput.value.trim();
    const conversionUnit = conversionUnitInput.value.trim();
    const conversionValue = parseFloat(conversionValueInput.value);
    const lowThreshold = parseFloat(lowThresholdInput.value);
    const lowServingThreshold = parseFloat(lowServingThresholdInput.value);

    if (!name || isNaN(quantity) || !unit) {
      showToast("Please fill in name, quantity, and unit.", "error");
      return;
    }

    if (lowThresholdInput.value.trim() === "" && lowServingThresholdInput.value.trim() === "") {
      // Not a hard blocker — some items genuinely don't need either
      // threshold — but this is the #1 cause of "why isn't this showing
      // as low stock," so flag it clearly instead of saving silently.
      const proceed = confirm(
        "⚠️ No Low Stock Threshold or Low Serving Threshold set for this item.\n\n" +
        "Without at least one of these, this item will NEVER appear in Low Stock Alerts " +
        "no matter how low the quantity gets or how few drinks it can still make.\n\n" +
        "Save anyway without either threshold?"
      );
      if (!proceed) return;
    }

    const stockList = loadStock();
    const duplicateIndex = stockList.findIndex(item => item.name.toLowerCase() === name.toLowerCase());

    if (!isEditing && duplicateIndex !== -1) {
      showToast(`❌ Item already exists at row ${duplicateIndex + 1}`, "error");
      return;
    }

    const stockItem = {
      name,
      quantity,
      unit,
      conversionUnit: conversionUnit || "",
      conversionValue: isNaN(conversionValue) ? null : conversionValue,
      lowThreshold: isNaN(lowThreshold) ? null : lowThreshold,
      lowServingThreshold: isNaN(lowServingThreshold) ? null : lowServingThreshold
    };

    if (isEditing && editIndex !== null) {
      stockList[editIndex] = stockItem;
      isEditing = false;
      editIndex = null;
      formTitle.textContent = "Add New Stock Item";
      submitBtn.textContent = "Save";
    } else {
      stockList.push(stockItem);
    }

    saveStock(stockList);
    renderStockTable();
    stockForm.reset();
    showToast("✅ Stock saved!", "success");
  });

  window.editStock = function (index) {
    const stockList = loadStock();
    const item = stockList[index];

    nameInput.value = item.name;
    qtyInput.value = item.quantity;
    unitInput.value = item.unit;
    conversionUnitInput.value = item.conversionUnit || "";
    conversionValueInput.value = item.conversionValue ?? "";
    lowThresholdInput.value = item.lowThreshold ?? "";
    lowServingThresholdInput.value = item.lowServingThreshold ?? "";

    isEditing = true;
    editIndex = index;
    formTitle.textContent = "Edit Stock Item";
    submitBtn.textContent = "Update Stock";
  };

  window.deleteStock = function (index) {
    if (!confirm("Are you sure you want to delete this item?")) return;

    const stockList = loadStock();
    stockList.splice(index, 1);
    saveStock(stockList);
    renderStockTable();
    showToast("🗑️ Item deleted.", "success");
  };

  function exportStockAsCSV() {
    const stock = loadStock();
    if (!stock.length) return showToast("No stock data to export!", "error");

    const csvHeader = "Item,Quantity,Unit,Conversion,LowThreshold,LowServingThreshold\n";
    const csvRows = stock.map(item => {
      const conversion = item.conversionUnit && item.conversionValue
        ? `1 ${item.unit} = ${item.conversionValue} ${item.conversionUnit}`
        : "";
      const lowThreshold = item.lowThreshold ?? "";
      const lowServingThreshold = item.lowServingThreshold ?? "";
      return `"${item.name}",${item.quantity},"${item.unit}","${conversion}",${lowThreshold},${lowServingThreshold}`;
    });

    const csvContent = csvHeader + csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `mintcha_stock_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importStockFromCSV(csvText) {
    const rows = csvText.trim().split("\n").slice(1);

    const parsed = rows.map(row => {
      const [name, quantityStr, unit, conversion, lowThresholdStr, lowServingThresholdStr] = row.split(",");
      const quantity = parseFloat(quantityStr);
      let conversionUnit = "", conversionValue = null;

      if (conversion && conversion.includes("=")) {
        const match = conversion.match(/= ([\d.]+) (\w+)/);
        if (match) {
          conversionValue = parseFloat(match[1]);
          conversionUnit = match[2];
        }
      }

      return {
        name: name.replace(/"/g, "").trim(),
        quantity: isNaN(quantity) ? 0 : quantity,
        unit: unit.replace(/"/g, "").trim(),
        conversionUnit,
        conversionValue,
        lowThreshold: isNaN(parseFloat(lowThresholdStr)) ? null : parseFloat(lowThresholdStr),
        lowServingThreshold: isNaN(parseFloat(lowServingThresholdStr)) ? null : parseFloat(lowServingThresholdStr)
      };
    });

    const existingStock = loadStock();

    parsed.forEach(item => {
      const index = existingStock.findIndex(s => s.name.toLowerCase() === item.name.toLowerCase());
      if (index !== -1) {
        existingStock[index] = item;
      } else {
        existingStock.push(item);
      }
    });

    saveStock(existingStock);
    renderStockTable();
    showToast("✅ Import complete", "success");
  }

  renderStockTable();

  // Keep the table (and its low-stock badges) live if a recipe changes on
  // Menu Recipes while this tab is open, same pattern as dashboard.js.
  window.addEventListener("storage", (e) => {
    if (["mintcha_stock", "menuItems"].includes(e.key)) {
      renderStockTable();
    }
  });
});