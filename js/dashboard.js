document.addEventListener("DOMContentLoaded", () => {
  const lowStockList = document.getElementById("lowStockList");

  // --- Safe Date Parser (DD/MM/YYYY-first, since en-MY locale is day-first) ---
  function parseDateSafe(dateString) {
    if (!dateString) return null;

    // 1️⃣ Try DD/MM/YYYY or DD-MM-YYYY FIRST (with optional time) — this matches
    // what our own checkout actually saves (en-MY locale = day-first), so it
    // must be checked before native Date() to avoid Date() silently
    // misreading it as MM/DD/YYYY when the day is 12 or lower.
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

    // 2️⃣ Fallback to native parser only if the regex didn't match at all
    // (e.g. ISO strings like "2026-07-11T02:21:10.000Z")
    let d = new Date(dateString);
    if (!isNaN(d.getTime())) return d;

    return null;
  }

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

  // === Today's Sales & Cup Summary (Admin only) ===
  function renderTodaySummary() {
    const role = localStorage.getItem("mintchaRole");
    const summaryCard = document.getElementById("todaySummaryCard");
    const summaryContent = document.getElementById("todaySummaryContent");
    if (!summaryCard || !summaryContent) return;
    if (role !== "admin") return; // stays hidden for non-admins

   summaryCard.style.display = "block";

    const dateLabel = document.getElementById("todaySummaryDate");
    if (dateLabel) {
      dateLabel.textContent = new Date().toLocaleDateString("en-MY", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }

    const allSales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");
    const todayStr = new Date().toDateString(); // e.g. "Fri Jul 11 2026"

    // Only count sales actually made today, and exclude refunded orders
    // from revenue/cup totals so the numbers reflect real business activity.
    const todaySales = allSales.filter(sale => {
      if (sale.status === "Refunded") return false;
      const saleDate = parseDateSafe(sale.date);
      if (!saleDate) return false;
      return saleDate.toDateString() === todayStr;
    });

    let totalRevenue = 0;
    let paidCups = 0;
    let freeCups = 0; // covers "Free" discount specifically
    let discountedCups = 0; // any other discount type (5%, 10%, Buy 2 Free 1, etc.)

    todaySales.forEach(sale => {
      totalRevenue += parseFloat(sale.total || 0);
      const cupsInSale = (sale.items || []).reduce((sum, i) => sum + (i.qty || 0), 0);

      if (sale.discountType === "Free") {
        freeCups += cupsInSale;
      } else if (sale.discountType && sale.discountType !== "None") {
        discountedCups += cupsInSale;
      } else {
        paidCups += cupsInSale;
      }
    });

    const totalCups = paidCups + freeCups + discountedCups;

    summaryContent.innerHTML = `
      <div class="summary-hero">
        <span class="label">Total Sales Today</span>
        <span class="value">RM${totalRevenue.toFixed(2)}</span>
      </div>
      <div class="summary-grid">
        <div class="summary-box total">
          <span class="icon">🥤</span>
          <span class="value">${totalCups}</span>
          <span class="label">Total Cups</span>
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
        </div>
        <div class="summary-box free">
          <span class="icon">🎉</span>
          <span class="value">${freeCups}</span>
          <span class="label">Free</span>
        </div>
      </div>
    `;
  }

  renderTodaySummary();
  renderLowStockAlerts();
});