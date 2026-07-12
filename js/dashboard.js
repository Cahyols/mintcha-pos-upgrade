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
  // === Sales & Cup Summary for a given date (Admin only) ===
  function renderSummaryForDate(targetDate) {
    const role = localStorage.getItem("mintchaRole");
    const summaryCard = document.getElementById("todaySummaryCard");
    const summaryContent = document.getElementById("todaySummaryContent");
    if (!summaryCard || !summaryContent) return;
    if (role !== "admin") return; // stays hidden for non-admins

    summaryCard.style.display = "block";

    const targetStr = targetDate.toDateString();
    const isToday = targetStr === new Date().toDateString();

    // Update heading title + date label
    const titleEl = document.getElementById("summaryTitle");
    const dateLabel = document.getElementById("todaySummaryDate");
    if (titleEl) titleEl.textContent = isToday ? "Today's Summary" : "Summary";
    if (dateLabel) {
      dateLabel.textContent = targetDate.toLocaleDateString("en-MY", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }

    const allSales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");

    // Only count sales made on the target date, excluding refunded orders
    // from revenue/cup totals so the numbers reflect real business activity.
    const daySales = allSales.filter(sale => {
      if (sale.status === "Refunded") return false;
      const saleDate = parseDateSafe(sale.date);
      if (!saleDate) return false;
      return saleDate.toDateString() === targetStr;
    });

    let totalRevenue = 0;
    let totalSubtotal = 0; 
    let paidCups = 0;
    let freeCups = 0;
    let discountedCups = 0;
     let totalDiscountAmount = 0; // 👈 new
      let totalFreeValue = 0; // 👈 new — value of free drinks at full price


    daySales.forEach(sale => {
      totalRevenue += parseFloat(sale.total || 0);
        totalSubtotal += parseFloat(sale.subtotal || 0);
       totalDiscountAmount += parseFloat(sale.discountAmount || 0); // 👈 new
      const cupsInSale = (sale.items || []).reduce((sum, i) => sum + (i.qty || 0), 0);

      // === Per-drink breakdown for the selected day ===
    const drinkCounts = {};
    daySales.forEach(sale => {
      (sale.items || []).forEach(item => {
        drinkCounts[item.name] = (drinkCounts[item.name] || 0) + (item.qty || 0);
      });
    });

    const sortedDrinks = Object.entries(drinkCounts).sort((a, b) => b[1] - a[1]);
    const maxQty = sortedDrinks.length ? sortedDrinks[0][1] : 0;

    const breakdownEl = document.getElementById("drinkBreakdown");
    if (breakdownEl) {
      if (!sortedDrinks.length) {
        breakdownEl.innerHTML = "";
      } else {
        breakdownEl.innerHTML = `
          <div class="drink-breakdown">
            <h4>🥤 Drinks Sold${isToday ? " Today" : ""}</h4>
            ${sortedDrinks.map(([name, qty]) => `
              <div class="drink-row">
                <span class="drink-name">${name}</span>
                <div class="drink-bar-track">
                  <div class="drink-bar-fill" style="width:${maxQty ? (qty / maxQty) * 100 : 0}%"></div>
                </div>
                <span class="drink-qty">${qty}</span>
              </div>
            `).join("")}
          </div>
        `;
      }
    }

      if (sale.discountType === "Free") {
        freeCups += cupsInSale;
        // Value of the free items is just the subtotal of that sale,
        // since a "Free" discount zeroes out the whole order's price.
        totalFreeValue += parseFloat(sale.subtotal || 0); // 👈 new
      } else if (sale.discountType && sale.discountType !== "None") {
        discountedCups += cupsInSale;
      } else {
        paidCups += cupsInSale;
      }
    });

    const totalCups = paidCups + freeCups + discountedCups;

    // Friendly empty state if no sales happened on the chosen day at all
   if (!daySales.length) {
      summaryContent.innerHTML = `
        <div class="summary-hero">
          <span class="label">Total Sales</span>
          <span class="value">RM0.00</span>
        </div>
        <p style="text-align:center; color:#999; margin: 10px 0 0;">No sales recorded on this date.</p>
      `;
      const breakdownEl = document.getElementById("drinkBreakdown");
      if (breakdownEl) breakdownEl.innerHTML = "";
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
          <span class="sub-label">-RM${totalDiscountAmount.toFixed(2)}</span>
        </div>
        <div class="summary-box free">
          <span class="icon">🎉</span>
          <span class="value">${freeCups}</span>
          <span class="label">Free</span>
          <span class="sub-label">RM${totalFreeValue.toFixed(2)}</span>
        </div>
      </div>
    `;
  }

  // === Wire up the date picker ===
  function setupSummaryDatePicker() {
    const datePicker = document.getElementById("summaryDatePicker");
    const todayBtn = document.getElementById("summaryTodayBtn");
    if (!datePicker) return;

    // Default the input to today's date, in the yyyy-mm-dd format <input type="date"> requires
    const today = new Date();
    const isoToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    datePicker.value = isoToday;
    datePicker.max = isoToday; // can't pick a future date

    datePicker.addEventListener("change", () => {
      if (!datePicker.value) return;
      // datePicker.value is "YYYY-MM-DD" — construct as local time, not UTC,
      // so it matches the local-time dates parseDateSafe produces elsewhere.
      const [y, m, d] = datePicker.value.split("-").map(Number);
      renderSummaryForDate(new Date(y, m - 1, d));
    });

    todayBtn?.addEventListener("click", () => {
      datePicker.value = isoToday;
      renderSummaryForDate(new Date());
    });
  }

  setupSummaryDatePicker();
  renderSummaryForDate(new Date());
  renderLowStockAlerts();
});