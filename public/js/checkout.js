const orderId = document.getElementById('orderId').value;
let pollTimer = null;

async function loadOrder() {
  if (!orderId) {
    document.getElementById('orderSummary').innerHTML = '<p class="muted">No order selected. <a href="/cart">Go back to your cart</a>.</p>';
    return;
  }
  const res = await fetch(`/api/orders/${orderId}`, { credentials: 'include' });
  const data = await res.json();
  if (!data.success) {
    document.getElementById('orderSummary').innerHTML = `<p class="muted">${data.message}</p>`;
    return;
  }
  const o = data.order;
  document.getElementById('orderSummary').innerHTML = `
    <p><strong>Order:</strong> ${o.orderNumber}</p>
    <p><strong>Status:</strong> ${o.status}</p>
    <p><strong>Total:</strong> TZS ${o.totalAmount}</p>
  `;
  if (o.status === 'paid') {
    document.getElementById('payStatus').textContent = 'Payment complete! Redirecting to your library...';
    setTimeout(() => (window.location.href = '/library'), 1500);
  }
}

document.getElementById('payForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('payError').textContent = '';
  document.getElementById('payStatus').textContent = '';

  const provider = document.getElementById('provider').value;
  const phone = document.getElementById('phone').value;

  const res = await fetch('/api/payments/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ orderId, provider, phone })
  });
  const data = await res.json();

  if (!data.success) {
    document.getElementById('payError').textContent = data.message || 'Payment failed to initiate.';
    return;
  }

  document.getElementById('payStatus').textContent = data.message + ' Waiting for confirmation...';

  // Poll payment + order status until success/failure (mobile money confirmation is async).
  pollTimer = setInterval(async () => {
    const statusRes = await fetch(`/api/payments/${data.paymentId}/status`, { credentials: 'include' });
    const statusData = await statusRes.json();
    if (statusData.status === 'success') {
      clearInterval(pollTimer);
      loadOrder();
    } else if (statusData.status === 'failed') {
      clearInterval(pollTimer);
      document.getElementById('payError').textContent = statusData.failureReason || 'Payment failed. Please try again.';
    }
  }, 3000);
});

loadOrder();
