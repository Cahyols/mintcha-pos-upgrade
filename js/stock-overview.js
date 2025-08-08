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

  window.getLowStockItems = function () {
    const stock = loadStock();
    return stock.filter(item => item.lowThreshold && item.quantity <= item.lowThreshold);
  };

  function renderStockTable() {
    const stockList = loadStock();
    const showOnlyLow = document.getElementById("toggleLowStockOnly")?.checked;
    stockTableBody.innerHTML = "";

    stockList.forEach((item, index) => {
      const isLow = typeof item.lowThreshold === "number" && item.quantity <= item.lowThreshold;
      if (showOnlyLow && !isLow) return;

      const row = document.createElement("tr");
      if (isLow) row.classList.add("low-stock");

      const conversion = item.conversionUnit && item.conversionValue
        ? `1 ${item.unit} = ${item.conversionValue} ${item.conversionUnit}`
        : "-";

      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${item.name}</td>
        <td>${item.quantity} ${isLow ? ' <span style="color:red;">⚠️</span>' : ''}</td>
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

    if (!name || isNaN(quantity) || !unit) {
      showToast("Please fill in name, quantity, and unit.", "error");
      return;
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
      lowThreshold: isNaN(lowThreshold) ? null : lowThreshold
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

    const csvHeader = "Item,Quantity,Unit,Conversion,LowThreshold\n";
    const csvRows = stock.map(item => {
      const conversion = item.conversionUnit && item.conversionValue
        ? `1 ${item.unit} = ${item.conversionValue} ${item.conversionUnit}`
        : "";
      const lowThreshold = item.lowThreshold ?? "";
      return `"${item.name}",${item.quantity},"${item.unit}","${conversion}",${lowThreshold}`;
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
      const [name, quantityStr, unit, conversion, lowThresholdStr] = row.split(",");
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
        lowThreshold: isNaN(parseFloat(lowThresholdStr)) ? null : parseFloat(lowThresholdStr)
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
});
