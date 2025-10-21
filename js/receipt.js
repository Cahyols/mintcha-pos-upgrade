// === Receipt Handling ===
function generateReceipt(order) {
  const receiptModal = document.getElementById("receiptModal");
  const receiptContent = document.getElementById("receiptContent");

  const itemList = order.items
    .map(i => `<div>${i.qty} × ${i.name} - RM${(i.qty * i.price).toFixed(2)}</div>`)
    .join('');

  receiptContent.innerHTML = `
    <div class="receipt-brand">🍃 Mintcha</div>
    <div class="receipt-header">
      <div><strong>${order.date}</strong></div>
      <div>Order ID: ${order.id}</div>
      <div>Cashier: ${order.cashier}</div>
    </div>
    <div class="receipt-body">
      ${itemList}
      <div><em>Note:</em> ${order.note || '-'}</div>
      <div><strong>Discount:</strong> ${order.discountType || 'None'}</div>
      <div><strong>Payment:</strong> ${order.paymentMethod}</div>
    </div>
    <div class="receipt-footer">
      <strong>Subtotal:</strong> RM${order.subtotal.toFixed(2)}<br>
      <strong>Discount:</strong> -RM${order.discountAmount.toFixed(2)}<br>
      <strong>Total:</strong> RM${order.total.toFixed(2)}<br>
      <div class="receipt-barcode"></div>
      <div>#TeamRumput VS #TeamMint 💚</div>
      <button id="closeReceiptModal">OK</button>
    </div>
  `;

  document.getElementById("closeReceiptModal").onclick = () => {
    receiptModal.style.display = "none";
  };

  receiptModal.style.display = "flex";
}
