document.addEventListener("DOMContentLoaded", () => {
  const lowStockList = document.getElementById("lowStockList");

  // --- Safe Date Parser (DD/MM/YYYY-first, since en-MY locale is day-first) ---
  function parseDateSafe(dateString) {
    if (!dateString) return null;

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

      const localDate = new Date(year, month, day, hour, minute, second);
      if (!isNaN(localDate.getTime())) return localDate;
    }

    let d = new Date(dateString);
    if (!isNaN(d.getTime())) return d;

    return null;
  }

  // Load stock from localStorage
  function loadStock() {
    return JSON.parse(localStorage.getItem("mintcha_stock") || "[]");
  }

  // Load menu items (for category + price lookup) from localStorage
  function loadMenuCategoryMap() {
    const menuItems = JSON.parse(localStorage.getItem("menuItems") || "[]");
    const map = {};
    menuItems.forEach(item => {
      map[item.name] = { category: item.category || "uncategorized", price: item.price || 0 };
    });
    return map;
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

  // ===================================================================
  // === Sales / Cup Summary (Admin only) — supports Day/Week/Month ===
  // ===================================================================

  let currentViewMode = "day"; // "day" | "week" | "month"

  function getRangeForMode(mode, refDate) {
    const start = new Date(refDate);
    const end = new Date(refDate);

    if (mode === "day") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (mode === "week") {
      const day = start.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      start.setDate(start.getDate() + diffToMonday);
      start.setHours(0, 0, 0, 0);

      end.setTime(start.getTime());
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (mode === "month") {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);

      end.setMonth(start.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
    }

    return [start, end];
  }

  function formatRangeLabel(mode, start, end) {
    const opts = { day: "numeric", month: "long", year: "numeric" };
    if (mode === "day") {
      return start.toLocaleDateString("en-MY", { weekday: "long", ...opts });
    }
    if (mode === "week") {
      const startStr = start.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
      const endStr = end.toLocaleDateString("en-MY", opts);
      return `${startStr} – ${endStr}`;
    }
    return start.toLocaleDateString("en-MY", { month: "long", year: "numeric" });
  }

  // Renders the small "drink · qty" rows inside a category box
  function renderCategoryDrinksList(drinksMap) {
    const entries = Object.entries(drinksMap).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return "";

    return `
      <div class="cat-drink-list">
        ${entries.map(([name, qty]) => `
          <div class="cat-drink-row">
            <span class="cat-drink-name">${name}</span>
            <span class="cat-drink-qty">${qty}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  // === Sales & Cup Summary for a given date range ===
  function renderSummaryForRange(startDate, endDate, mode) {
    const role = localStorage.getItem("mintchaRole");
    const summaryCard = document.getElementById("todaySummaryCard");
    const summaryContent = document.getElementById("todaySummaryContent");
    if (!summaryCard || !summaryContent) return;
    if (role !== "admin") return; // stays hidden for non-admins

    summaryCard.style.display = "block";

    const isToday = mode === "day" && startDate.toDateString() === new Date().toDateString();

    const titleEl = document.getElementById("summaryTitle");
    const dateLabel = document.getElementById("todaySummaryDate");
    if (titleEl) {
      titleEl.textContent = isToday
        ? "Today's Summary"
        : mode === "day" ? "Summary" : mode === "week" ? "Weekly Summary" : "Monthly Summary";
    }
    if (dateLabel) dateLabel.textContent = formatRangeLabel(mode, startDate, endDate);

    const allSales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");

    const rangeSales = allSales.filter(sale => {
      if (sale.status === "Refunded") return false;
      const saleDate = parseDateSafe(sale.date);
      if (!saleDate) return false;
      return saleDate >= startDate && saleDate <= endDate;
    });

    let totalRevenue = 0;
    let totalSubtotal = 0;
    let paidCups = 0;
    let freeCups = 0;
    let discountedCups = 0;
    let totalDiscountAmount = 0;
    let totalFreeValue = 0;

    // Category breakdown setup (now includes per-drink counts within each category)
    const menuCategoryMap = loadMenuCategoryMap();
    const categoryTotals = {
      matcha:  { cups: 0, revenue: 0, drinks: {} },
      coffee:  { cups: 0, revenue: 0, drinks: {} },
      dessert: { cups: 0, revenue: 0, drinks: {} },
      uncategorized: { cups: 0, revenue: 0, drinks: {} }
    };

    rangeSales.forEach(sale => {
      totalRevenue += parseFloat(sale.total || 0);
      totalSubtotal += parseFloat(sale.subtotal || 0);
      totalDiscountAmount += parseFloat(sale.discountAmount || 0);
      const cupsInSale = (sale.items || []).reduce((sum, i) => sum + (i.qty || 0), 0);

      if (sale.discountType === "Free") {
        freeCups += cupsInSale;
        totalFreeValue += parseFloat(sale.subtotal || 0);
      } else if (sale.discountType && sale.discountType !== "None") {
        discountedCups += cupsInSale;
      } else {
        paidCups += cupsInSale;
      }

      (sale.items || []).forEach(item => {
        const meta = menuCategoryMap[item.name] || { category: "uncategorized", price: 0 };
        const cat = categoryTotals[meta.category] ? meta.category : "uncategorized";
        const qty = item.qty || 0;
        categoryTotals[cat].cups += qty;
        categoryTotals[cat].revenue += meta.price * qty;
        categoryTotals[cat].drinks[item.name] = (categoryTotals[cat].drinks[item.name] || 0) + qty;
      });
    });

    const totalCups = paidCups + freeCups + discountedCups;

    // Friendly empty state if no sales happened in the chosen range at all
    if (!rangeSales.length) {
      summaryContent.innerHTML = `
        <div class="summary-hero">
          <div class="hero-main">
            <span class="label">Total Sales</span>
            <span class="value">RM0.00</span>
          </div>
        </div>
        <p style="text-align:center; color:#999; margin: 10px 0 0;">No sales recorded in this period.</p>
      `;
      return;
    }

    summaryContent.innerHTML = `
      <div class="summary-hero">
        <div class="hero-main">
          <span class="label">Total Sales${isToday ? " Today" : ""}</span>
          <span class="value">RM${totalRevenue.toFixed(2)}</span>
        </div>
        <div class="hero-breakdown">
          <div class="hero-row">
            <span>Subtotal (before discounts)</span>
            <span>RM${totalSubtotal.toFixed(2)}</span>
          </div>
          <div class="hero-row">
            <span>Total Discount Given</span>
            <span>-RM${totalDiscountAmount.toFixed(2)}</span>
          </div>
          <div class="hero-row">
            <span>Free Drinks Value</span>
            <span>-RM${totalFreeValue.toFixed(2)}</span>
          </div>
          <div class="hero-row hero-row-total">
            <span>Grand Total</span>
            <span>RM${totalRevenue.toFixed(2)}</span>
          </div>
        </div>
      </div>
      <div class="summary-grid">
        <div class="summary-box total">
          <span class="icon">🥤</span>
          <span class="value">${totalCups}</span>
          <span class="label">Total Transaction</span>
        </div>
        <div class="summary-box paid">
          <span class="icon">💰</span>
          <span class="value">${paidCups}</span>
          <span class="label">Full-Price</span>
        </div>
        <div class="summary-box discount">
          <span class="icon">🏷️</span>
          <span class="value">${discountedCups}</span>
          <span class="label">Discounted</span>
          <span class="sub-label">-RM${totalDiscountAmount.toFixed(2)}</span>
        </div>
        <div class="summary-box free">
          <span class="icon">🎉</span>
          <span class="value">${freeCups}</span>
          <span class="label">Free</span>
          <span class="sub-label">worth RM${totalFreeValue.toFixed(2)}</span>
        </div>
      </div>
      <div class="category-grid">
        ${["matcha", "coffee", "dessert"].map(cat => `
          <div class="category-box cat-${cat}">
            <span class="cat-badge cat-${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
            <span class="category-cups">${categoryTotals[cat].cups}</span>
            <span class="category-sub">cups · RM${categoryTotals[cat].revenue.toFixed(2)}</span>
            ${renderCategoryDrinksList(categoryTotals[cat].drinks)}
          </div>
        `).join("")}
        ${categoryTotals.uncategorized.cups > 0 ? `
          <div class="category-box cat-uncat">
            <span class="cat-badge cat-uncat">Uncategorized</span>
            <span class="category-cups">${categoryTotals.uncategorized.cups}</span>
            <span class="category-sub">cups · RM${categoryTotals.uncategorized.revenue.toFixed(2)}</span>
            ${renderCategoryDrinksList(categoryTotals.uncategorized.drinks)}
          </div>
        ` : ""}
      </div>
    `;
  }

  function refreshSummary() {
    const datePicker = document.getElementById("summaryDatePicker");
    if (!datePicker || !datePicker.value) return;
    const [y, m, d] = datePicker.value.split("-").map(Number);
    const refDate = new Date(y, m - 1, d);
    const [start, end] = getRangeForMode(currentViewMode, refDate);
    renderSummaryForRange(start, end, currentViewMode);
  }

  function setupSummaryDatePicker() {
    const datePicker = document.getElementById("summaryDatePicker");
    const todayBtn = document.getElementById("summaryTodayBtn");
    const modeButtons = document.querySelectorAll(".view-mode-btn");
    if (!datePicker) return;

    const today = new Date();
    const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    datePicker.value = isoToday;
    datePicker.max = isoToday;

    datePicker.addEventListener("change", refreshSummary);

    todayBtn?.addEventListener("click", () => {
      datePicker.value = isoToday;
      refreshSummary();
    });

    modeButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        modeButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentViewMode = btn.dataset.mode;
        refreshSummary();
      });
    });
  }

  setupSummaryDatePicker();
  refreshSummary();

  renderLowStockAlerts();
});