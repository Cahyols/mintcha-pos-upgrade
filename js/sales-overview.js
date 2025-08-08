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

  // Admin Export Buttons
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

      const clearBtn = document.createElement("button");
      clearBtn.textContent = "🗑️ Clear All Sales";
      clearBtn.className = "admin-btn export-btn";
      clearBtn.style.backgroundColor = "#c62828";
      clearBtn.style.color = "#fff";
      clearBtn.onclick = () => {
        if (confirm("⚠️ Delete ALL sales data? This cannot be undone.")) {
          localStorage.removeItem("mintcha_sales");
          alert("✅ Sales cleared.");
          location.reload();
        }
      };
      exportControls.appendChild(clearBtn);
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

  function renderSalesPage(page) {
    tableBody.innerHTML = "";
    const start = (page - 1) * pageSize;
    const pageSales = filteredSales.slice(start, start + pageSize);

    pageSales.forEach((sale, index) => {
      if (!sale || !sale.date) return;

      const saleTime = new Date(sale.date);
      if (isNaN(saleTime.getTime())) return;

      const [date, time] = [
        saleTime.toLocaleDateString(),
        saleTime.toLocaleTimeString(),
      ];

      const now = new Date();
      const minutesElapsed = (now - saleTime) / 60000;
      const isRefunded = sale.status === "Refunded";
      const refundedClass = isRefunded ? "refunded-row" : "";
      const allowRefund = !isRefunded && minutesElapsed >= 15 && minutesElapsed < 30;

      let statusText = "";
      let statusBadge = "";

      if (isRefunded) {
        statusText = "Refunded";
        statusBadge = `<span class="badge badge-refunded" title="${sale.refundReason || 'No reason provided'}">Refunded</span>`;
      } else if (minutesElapsed < 15) {
        statusText = "Preparing";
        statusBadge = `<span class="badge badge-preparing">Preparing</span>`;
      } else {
        statusText = "Completed";
        statusBadge = `<span class="badge badge-completed">Completed</span>`;
      }

      // Store derived status for filtering
      sale._derivedStatus = statusText;

      const row = document.createElement("tr");
      row.className = refundedClass;

      const itemList = sale.items.map(item => `<li>${item.qty} × ${item.name}</li>`).join("");

      row.innerHTML = `
        <td>${start + index + 1}</td>
        <td>${sale.id}</td>
        <td>${date}</td>
        <td>${time}</td>
        <td>${sale.cashier}</td>
        <td>${sale.customer || "-"}</td>
        <td><ul>${itemList}</ul></td>
        <td>${sale.note || "-"}</td>
        <td>RM${parseFloat(sale.total).toFixed(2)}</td>
        <td>${sale.paymentMethod}</td>
      `;

      const statusCell = document.createElement("td");

      if (allowRefund) {
        const refundBtn = document.createElement("button");
        refundBtn.textContent = "Refund";
        refundBtn.onclick = () => {
          if (confirm(`Refund order ${sale.id}?`)) {
            const reason = prompt("Enter refund reason:");
            if (reason) {
              sale.status = "Refunded";
              sale.refundReason = reason;
              sale.refundedAt = new Date().toISOString();

              const allSales = loadSales();
              const idx = allSales.findIndex(s => s.id === sale.id);
              if (idx !== -1) {
                allSales[idx] = sale;
                localStorage.setItem("mintcha_sales", JSON.stringify(allSales));
              }

              applyFilters(); // refresh with filters
            }
          }
        };
        statusCell.appendChild(refundBtn);
      } else {
        statusCell.innerHTML = statusBadge;
      }

      row.appendChild(statusCell);
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
    const saleDate = new Date(sale.date);
    if (isNaN(saleDate)) return false;

    const dateStr = saleDate.toISOString().split("T")[0];

    const matchStart = !dateStart || dateStr >= dateStart;
    const matchEnd = !dateEnd || dateStr <= dateEnd;
    const matchCashier = !cashier || (sale.cashier || "").toLowerCase() === cashier;

    // Normalize and compare payment method
    const normalizedPayment = (sale.paymentMethod || "").toLowerCase().trim();
    const matchPayment = !payment || normalizedPayment === payment;

    // Normalize and compare status
    let derivedStatus = sale._derivedStatus;
    if (!derivedStatus) {
      if ((sale.status || "").toLowerCase() === "refunded") {
        derivedStatus = "refunded";
      } else {
        const now = new Date();
        const minutesElapsed = (now - saleDate) / 60000;
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

  // Auto-filter on filter changes
  ["filterCashier", "filterPayment", "filterStatus", "fromDate", "toDate"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", applyFilters);
  });
});

// === CSV Export Function ===
function exportToCSV() {
  const sales = JSON.parse(localStorage.getItem("mintcha_sales") || "[]");
  const rows = [
    ["Order ID", "Date", "Cashier", "Customer", "Items", "Total", "Payment", "Status", "Refund Reason"]
  ];

  sales.forEach(s => {
    const itemStr = s.items.map(i => `${i.qty}x${i.name}`).join(" | ");
    const d = new Date(s.date);
    const formattedDate = isNaN(d) ? s.date : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    rows.push([
      s.id,
      formattedDate,
      s.cashier,
      s.customer,
      itemStr,
      s.total,
      s.paymentMethod,
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
