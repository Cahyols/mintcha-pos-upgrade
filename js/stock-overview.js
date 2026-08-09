// === Stock Overview ===
// Reads/writes the "mintcha_stock" localStorage key that dashboard.js and
// order-management.js already read from (getMaxMakeableFromStock,
// getServingsInfo, convertStockQtyToUnit, etc.), so the field names here
// MUST stay in sync with those: name, quantity, unit, conversionUnit,
// conversionValue, lowThreshold, lowServingThreshold.
document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;

  const role = localStorage.getItem("mintchaRole");
  const user = localStorage.getItem("mintchaUser");

  const cashierDisplay = document.getElementById("currentCashier");
  if (cashierDisplay) cashierDisplay.textContent = user || "";

  const stockTableBody = document.getElementById("stockTableBody");
  const stockFormSection = document.getElementById("stockFormSection");
  const addStockForm = document.getElementById("addStockForm");
  const formTitle = document.getElementById("formTitle");
  const submitStockBtn = document.getElementById("submitStockBtn");
  const toggleLowStockOnly = document.getElementById("toggleLowStockOnly");
  const adminExportContainer = document.getElementById("adminExportContainer");
  const toast = document.getElementById("toast");

  // Tracks which stock item (by index in the FULL, unfiltered list) the
  // form is currently editing. null = the form is in "Add New" mode.
  let editingIndex = null;

  // === Toast feedback (reuses the .toast/.show CSS component) ===
  let toastTimer = null;
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
  }

  // === Storage helpers ===
  function loadStock() {
    return JSON.parse(localStorage.getItem("mintcha_stock") || "[]");
  }

  function saveStock(list) {
    localStorage.setItem("mintcha_stock", JSON.stringify(list));
  }

  // === Low-stock check ===
  // Kept intentionally simple here (quantity vs lowThreshold only) — the
  // fuller "OR servings-remaining" check lives in dashboard.js's
  // getStockLowInfo(), since that needs menu recipe data this page doesn't
  // load. This page's checkbox filter only needs the basic quantity check.
  function isLowStock(item) {
    const threshold = parseFloat(item.lowThreshold);
    const qty = parseFloat(item.quantity);
    return !isNaN(threshold) && !isNaN(qty) && qty <= threshold;
  }

  // === Admin-only controls: Add/Edit form + Export/Import buttons ===
  function renderAdminControls() {
    if (role !== "admin") {
      if (stockFormSection) stockFormSection.classList.add("hidden");
      if (adminExportContainer) adminExportContainer.innerHTML = "";
      return;
    }

    if (stockFormSection) stockFormSection.classList.remove("hidden");
    if (!adminExportContainer) return;

    adminExportContainer.innerHTML = "";

    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.textContent = "📤 Export Stock (JSON)";
    exportBtn.className = "export-btn";
    exportBtn.onclick = exportStockToJSON;
    adminExportContainer.appendChild(exportBtn);

    const importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.textContent = "📥 Import Stock (JSON)";
    importBtn.className = "import-btn";
    importBtn.onclick = () => importInput.click();
    adminExportContainer.appendChild(importBtn);

    // Matches the #importStockFile { display:none; } rule already defined
    // in stock-overview.html's inline <style> block.
    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.id = "importStockFile";
    importInput.accept = ".json";
    importInput.onchange = handleImportStockFile;
    adminExportContainer.appendChild(importInput);
  }

  function exportStockToJSON() {
    const stock = loadStock();
    const blob = new Blob([JSON.stringify(stock, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mintcha_stock_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleImportStockFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const imported = JSON.parse(evt.target.result);
        if (!Array.isArray(imported)) {
          throw new Error("Expected a JSON array of stock items");
        }

        if (!confirm(`Import ${imported.length} stock item(s)? This will REPLACE your current stock list.`)) {
          return;
        }

        saveStock(imported);
        resetForm();
        showToast(`✅ Imported ${imported.length} stock item(s).`);
        renderStockTable();
      } catch (err) {
        console.error(err);
        alert("❌ Failed to import — make sure it's a valid Stock JSON export (from \"📤 Export Stock\").");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  // === Table rendering ===
  function renderStockTable() {
    const stock = loadStock();
    const onlyLow = toggleLowStockOnly && toggleLowStockOnly.checked;
    const rows = onlyLow ? stock.filter(isLowStock) : stock;

    stockTableBody.innerHTML = "";

    if (!rows.length) {
      const emptyRow = document.createElement("tr");
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = 6;
      emptyCell.style.textAlign = "center";
      emptyCell.style.color = "#888";
      emptyCell.style.fontStyle = "italic";
      emptyCell.textContent = onlyLow
        ? "No low stock items 🎉"
        : "No stock items yet. Add your first item above.";
      emptyRow.appendChild(emptyCell);
      stockTableBody.appendChild(emptyRow);
      return;
    }

    rows.forEach((item, i) => {
      const row = document.createElement("tr");
      if (isLowStock(item)) row.classList.add("low-stock");

      const conversionText = item.conversionUnit && item.conversionValue
        ? `1 ${item.unit} = ${item.conversionValue} ${item.conversionUnit}`
        : "-";

      row.innerHTML = `
        <td>${i + 1}</td>
        <td>${item.name || "-"}</td>
        <td>${item.quantity ?? "-"}</td>
        <td>${item.unit || "-"}</td>
        <td>${conversionText}</td>
      `;

      const actionsCell = document.createElement("td");

      if (role === "admin") {
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.textContent = "✏️ Edit";
        editBtn.className = "admin-btn";
        editBtn.style.marginRight = "6px";
        editBtn.onclick = () => startEditItem(item);
        actionsCell.appendChild(editBtn);

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.textContent = "🗑️ Delete";
        deleteBtn.className = "admin-btn";
        deleteBtn.style.backgroundColor = "#c62828";
        deleteBtn.style.color = "#fff";
        deleteBtn.onclick = () => deleteItem(item);
        actionsCell.appendChild(deleteBtn);
      } else {
        actionsCell.textContent = "-";
      }

      row.appendChild(actionsCell);
      stockTableBody.appendChild(row);
    });
  }

  // === Add/Edit form ===
  function startEditItem(item) {
    const stock = loadStock();
    // Look up by name against the FULL (unfiltered) list, since the row's
    // position in a filtered "low stock only" view wouldn't map back to
    // the right index in localStorage.
    const idx = stock.findIndex(s => s.name === item.name);
    if (idx === -1) return;

    editingIndex = idx;

    document.getElementById("stockName").value = item.name || "";
    document.getElementById("stockQty").value = item.quantity ?? "";
    document.getElementById("stockUnit").value = item.unit || "";
    document.getElementById("conversionUnit").value = item.conversionUnit || "";
    document.getElementById("conversionValue").value = item.conversionValue ?? "";
    document.getElementById("lowThreshold").value = item.lowThreshold ?? "";
    document.getElementById("lowServingThreshold").value = item.lowServingThreshold ?? "";

    if (formTitle) formTitle.textContent = `Editing "${item.name}"`;
    if (submitStockBtn) submitStockBtn.textContent = "Save Changes";

    stockFormSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm() {
    editingIndex = null;
    if (addStockForm) addStockForm.reset();
    if (formTitle) formTitle.textContent = "Add New Stock Item";
    if (submitStockBtn) submitStockBtn.textContent = "Save";
  }

  function deleteItem(item) {
    if (!confirm(`Delete "${item.name}" from stock? This cannot be undone.`)) return;

    const stock = loadStock();
    const idx = stock.findIndex(s => s.name === item.name);
    if (idx !== -1) {
      stock.splice(idx, 1);
      saveStock(stock);
    }

    if (editingIndex === idx) resetForm();

    showToast(`🗑️ "${item.name}" deleted.`);
    renderStockTable();
  }

  if (addStockForm) {
    addStockForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const name = document.getElementById("stockName").value.trim();
      const quantity = parseFloat(document.getElementById("stockQty").value);
      const unit = document.getElementById("stockUnit").value.trim();
      const conversionUnit = document.getElementById("conversionUnit").value.trim();
      const conversionValueRaw = document.getElementById("conversionValue").value;
      const lowThresholdRaw = document.getElementById("lowThreshold").value;
      const lowServingThresholdRaw = document.getElementById("lowServingThreshold").value;

      if (!name || isNaN(quantity) || !unit) {
        alert("Please fill in Item Name, Quantity, and Unit.");
        return;
      }

      const newItem = {
        name,
        quantity,
        unit,
        conversionUnit: conversionUnit || "",
        conversionValue: conversionValueRaw !== "" ? parseFloat(conversionValueRaw) : "",
        lowThreshold: lowThresholdRaw !== "" ? parseFloat(lowThresholdRaw) : "",
        lowServingThreshold: lowServingThresholdRaw !== "" ? parseFloat(lowServingThresholdRaw) : ""
      };

      const stock = loadStock();

      if (editingIndex !== null && stock[editingIndex]) {
        const oldName = stock[editingIndex].name;

        // Renaming an item would silently stop it matching any Menu
        // Recipes ingredient that still references the OLD name (recipes
        // are matched by name, not by index) — warn before allowing it.
        if (oldName !== name) {
          const proceed = confirm(
            `You're renaming "${oldName}" to "${name}".\n\n` +
            `Any drink recipe in Menu Recipes that references the old ` +
            `ingredient name won't automatically update, and will stop ` +
            `matching this stock item.\n\nContinue?`
          );
          if (!proceed) return;
        }

        stock[editingIndex] = newItem;
        showToast(`✅ "${name}" updated.`);
      } else {
        const duplicateIdx = stock.findIndex(
          s => s.name.trim().toLowerCase() === name.toLowerCase()
        );
        if (duplicateIdx !== -1) {
          alert(`"${name}" already exists in stock. Edit that item instead, or use a different name.`);
          return;
        }

        stock.push(newItem);
        showToast(`✅ "${name}" added.`);
      }

      saveStock(stock);
      resetForm();
      renderStockTable();
    });
  }

  toggleLowStockOnly?.addEventListener("change", renderStockTable);

  // === Live updates if stock changes in another tab (e.g. a sale in
  // Order Management deducts stock while this page is open) ===
  window.addEventListener("storage", (e) => {
    if (e.key === "mintcha_stock") renderStockTable();
  });

  renderAdminControls();
  renderStockTable();
});