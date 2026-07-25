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
  let hourlyReportOpen = false; // whether the Hourly Report panel is expanded

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

  // === Hourly Report helpers ===
  function formatHourLabel(hour) {
    const start = new Date(2000, 0, 1, hour);
    const end = new Date(2000, 0, 1, hour + 1);
    const opts = { hour: "numeric", hour12: true };
    return `${start.toLocaleTimeString("en-MY", opts)} – ${end.toLocaleTimeString("en-MY", opts)}`;
  }

  const CATEGORY_DISPLAY_NAMES = {
    matcha: "Matcha",
    coffee: "Coffee",
    dessert: "Dessert",
    uncategorized: "Uncategorized"
  };

  function renderHourlyReport(rangeSales, mode) {
    const card = document.getElementById("hourlyReportCard");
    const content = document.getElementById("hourlyReportContent");
    const toggleBtn = document.getElementById("hourlyToggleBtn");
    if (!card || !content || !toggleBtn) return;

    // Hourly breakdown only makes sense for a single day
    if (mode !== "day") {
      card.style.display = "none";
      toggleBtn.style.display = "none";
      return;
    }
    toggleBtn.style.display = "inline-block";

    if (!hourlyReportOpen) {
      card.style.display = "none";
      toggleBtn.classList.remove("active");
      return;
    }

    toggleBtn.classList.add("active");
    card.style.display = "block";

    const menuCategoryMap = loadMenuCategoryMap();

    const hourly = Array.from({ length: 24 }, () => ({
      revenue: 0,
      transactions: 0,
      discount: 0,
      cups: 0,
      categoryCups: {} // { matcha: 3, coffee: 1, ... } for this hour
    }));

    rangeSales.forEach(sale => {
      const saleDate = parseDateSafe(sale.date);
      if (!saleDate) return;
      const h = saleDate.getHours();
      const bucket = hourly[h];

      bucket.revenue += parseFloat(sale.total || 0);
      bucket.transactions += 1;
      bucket.discount += parseFloat(sale.discountAmount || 0);

      (sale.items || []).forEach(item => {
        const qty = item.qty || 0;
        bucket.cups += qty;

        const meta = menuCategoryMap[item.name] || { category: "uncategorized" };
        const cat = CATEGORY_DISPLAY_NAMES[meta.category] ? meta.category : "uncategorized";
        bucket.categoryCups[cat] = (bucket.categoryCups[cat] || 0) + qty;
      });
    });

    const activeHours = hourly
      .map((data, hour) => ({ hour, ...data }))
      .filter(h => h.transactions > 0);

    if (!activeHours.length) {
      content.innerHTML = `<p style="text-align:center; color:#999;">No sales recorded in this period.</p>`;
      return;
    }

    const maxRevenue = Math.max(...activeHours.map(h => h.revenue));
    const peak = activeHours.reduce((a, b) => (b.revenue > a.revenue ? b : a));

    content.innerHTML = `
      <div class="hourly-peak-banner">
        🔥 Peak Hour: <strong>${formatHourLabel(peak.hour)}</strong> — RM${peak.revenue.toFixed(2)} (${peak.transactions} bill${peak.transactions !== 1 ? "s" : ""}, ${peak.cups} cup${peak.cups !== 1 ? "s" : ""})
      </div>
      <div class="hourly-list">
        ${activeHours.map(h => {
          const avgTicket = h.transactions > 0 ? h.revenue / h.transactions : 0;
          const topCatEntry = Object.entries(h.categoryCups).sort((a, b) => b[1] - a[1])[0];
          const topCatLabel = topCatEntry ? CATEGORY_DISPLAY_NAMES[topCatEntry[0]] || topCatEntry[0] : "–";

          return `
          <div class="hourly-row">
            <div class="hourly-row-main">
              <span class="hourly-time">${formatHourLabel(h.hour)}</span>
              <div class="hourly-bar-track">
                <div class="hourly-bar-fill" style="width:${maxRevenue > 0 ? (h.revenue / maxRevenue) * 100 : 0}%"></div>
              </div>
              <span class="hourly-revenue">RM${h.revenue.toFixed(2)}</span>
            </div>
            <div class="hourly-row-meta">
              <span class="hourly-meta-item">🧾 ${h.transactions} bill${h.transactions !== 1 ? "s" : ""}</span>
              <span class="hourly-meta-item">🥤 ${h.cups} cup${h.cups !== 1 ? "s" : ""}</span>
              <span class="hourly-meta-item">💳 Avg RM${avgTicket.toFixed(2)}</span>
              <span class="hourly-meta-item hourly-top-cat">⭐ ${topCatLabel}</span>
              ${h.discount > 0 ? `<span class="hourly-discount">-RM${h.discount.toFixed(2)} discount</span>` : ""}
            </div>
          </div>
        `;
        }).join("")}
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

    // Render (or hide) the Hourly Report panel for this range
    renderHourlyReport(rangeSales, mode);

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
  matcha:  { cups: 0, revenue: 0, discount: 0, drinks: {} },
  coffee:  { cups: 0, revenue: 0, discount: 0, drinks: {} },
  dessert: { cups: 0, revenue: 0, discount: 0, drinks: {} },
  uncategorized: { cups: 0, revenue: 0, discount: 0, drinks: {} }
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

  // === First pass: bucket this sale's actual line totals by category ===
  // (uses the price actually sold at, i.e. item.price, so it sums to
  // exactly sale.subtotal — using today's menu price would drift if a
  // price was changed since this sale happened)
  const saleCategorySubtotal = {};
  (sale.items || []).forEach(item => {
    const meta = menuCategoryMap[item.name] || { category: "uncategorized" };
    const cat = categoryTotals[meta.category] ? meta.category : "uncategorized";
    const qty = item.qty || 0;
    const lineTotal = (item.price || 0) * qty;

    categoryTotals[cat].cups += qty;
    categoryTotals[cat].revenue += (menuCategoryMap[item.name]?.price ?? item.price ?? 0) * qty;
    categoryTotals[cat].drinks[item.name] = (categoryTotals[cat].drinks[item.name] || 0) + qty;

    saleCategorySubtotal[cat] = (saleCategorySubtotal[cat] || 0) + lineTotal;
  });

  // === Second pass: spread this sale's discount across categories,
  // proportional to how much of the sale's subtotal each category made up ===
  const saleSubtotal = parseFloat(sale.subtotal || 0);
  const saleDiscount = parseFloat(sale.discountAmount || 0);
  if (saleSubtotal > 0 && saleDiscount > 0) {
    Object.entries(saleCategorySubtotal).forEach(([cat, catSubtotal]) => {
      const share = (catSubtotal / saleSubtotal) * saleDiscount;
      categoryTotals[cat].discount += share;
    });
  }
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
         
          <span class="value">${totalCups}</span>
          <span class="label">Total Transaction</span>
        </div>
        <div class="summary-box paid">
  
          <span class="value">${paidCups}</span>
          <span class="label">Full-Price</span>
        </div>
        <div class="summary-box discount">
     
          <span class="value">${discountedCups}</span>
          <span class="label">Discounted</span>
          <span class="sub-label">-RM${totalDiscountAmount.toFixed(2)}</span>
        </div>
        <div class="summary-box free">
        
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
            <span class="category-sub">RM${categoryTotals[cat].revenue.toFixed(2)}</span>
            ${categoryTotals[cat].discount > 0 ? `<span class="category-discount">-RM${categoryTotals[cat].discount.toFixed(2)} discount</span>` : ""}
            ${renderCategoryDrinksList(categoryTotals[cat].drinks)}
          </div>
        `).join("")}
        ${categoryTotals.uncategorized.cups > 0 ? `
          <div class="category-box cat-uncat">
            <span class="cat-badge cat-uncat">Uncategorized</span>
            <span class="category-cups">${categoryTotals.uncategorized.cups}</span>
            <span class="category-sub">RM${categoryTotals.uncategorized.revenue.toFixed(2)}</span>
            ${categoryTotals.uncategorized.discount > 0 ? `<span class="category-discount">-RM${categoryTotals.uncategorized.discount.toFixed(2)} discount</span>` : ""}
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
    const prevBtn = document.getElementById("summaryPrevBtn");
    const nextBtn = document.getElementById("summaryNextBtn");
    const modeButtons = document.querySelectorAll(".view-mode-btn");
    const hourlyToggleBtn = document.getElementById("hourlyToggleBtn");
    if (!datePicker) return;

    const today = new Date();
    const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    datePicker.value = isoToday;
    datePicker.max = isoToday; // can't pick a future date

    datePicker.addEventListener("change", refreshSummary);

    todayBtn?.addEventListener("click", () => {
      datePicker.value = isoToday;
      refreshSummary();
    });

    // === Toggle the Hourly Report panel open/closed ===
    hourlyToggleBtn?.addEventListener("click", () => {
      hourlyReportOpen = !hourlyReportOpen;
      refreshSummary();
    });

    // === Step the picker's date backward/forward by one unit of the
    // current view mode (1 day / 1 week / 1 month), then re-render ===
    function shiftRange(direction) {
      if (!datePicker.value) return;
      const [y, m, d] = datePicker.value.split("-").map(Number);
      const refDate = new Date(y, m - 1, d);

      if (currentViewMode === "day") {
        refDate.setDate(refDate.getDate() + direction);
      } else if (currentViewMode === "week") {
        refDate.setDate(refDate.getDate() + direction * 7);
      } else if (currentViewMode === "month") {
        refDate.setMonth(refDate.getMonth() + direction);
      }

      // Don't allow navigating into the future past today
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      if (refDate > todayMidnight) return;

      const isoStr = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, "0")}-${String(refDate.getDate()).padStart(2, "0")}`;
      datePicker.value = isoStr;
      refreshSummary();
    }

    prevBtn?.addEventListener("click", () => shiftRange(-1));
    nextBtn?.addEventListener("click", () => shiftRange(1));

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