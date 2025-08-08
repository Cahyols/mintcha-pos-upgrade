document.addEventListener("DOMContentLoaded", () => {
  const lowStockList = document.getElementById("lowStockList");

  // Load stock from localStorage
  function loadStock() {
    return JSON.parse(localStorage.getItem("mintcha_stock") || "[]");
  }

  // Reusable function to get low stock items
  function getLowStockItems() {
    const stockList = loadStock();
    return stockList.filter(item => {
      return typeof item.lowThreshold === "number" &&
             !isNaN(item.lowThreshold) &&
             item.quantity <= item.lowThreshold;
    });
  }

  function renderLowStockAlerts() {
    const lowStockItems = getLowStockItems();

    if (!lowStockItems.length) {
      lowStockList.innerHTML = `<li>✅ All stock levels are sufficient.</li>`;
      return;
    }

    lowStockList.innerHTML = lowStockItems.map(item => `
      <li>
        <strong>${item.name}</strong> – ${item.quantity} ${item.unit}
        ${item.conversionUnit ? ` (${item.conversionUnit})` : ""}
        <span style="color:red;">⚠️ Low Stock</span>
      </li>
    `).join("");
  }

  renderLowStockAlerts();
});
