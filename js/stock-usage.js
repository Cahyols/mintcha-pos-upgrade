document.addEventListener("DOMContentLoaded", () => {
  const usageTableBody = document.getElementById("usageTableBody");

  // Use mintcha_usage instead of calculating from sales + recipes
  const usageData = JSON.parse(localStorage.getItem("mintcha_usage") || "{}");

  // Get today's date in YYYY-MM-DD
  const today = new Date().toISOString().split("T")[0];

  // If today's usage exists, render it
  const todayUsage = usageData[today] || {};
  const usageKeys = Object.keys(todayUsage);

  if (!usageKeys.length) {
    usageTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No usage data available for today.</td></tr>`;
    return;
  }

  usageKeys.forEach((ingredientName, idx) => {
    const usage = todayUsage[ingredientName];
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${idx + 1}</td>
      <td>${ingredientName}</td>
      <td>${usage.total.toFixed(2)}</td>
      <td>${usage.unit}</td>
    `;
    usageTableBody.appendChild(row);
  });
});
