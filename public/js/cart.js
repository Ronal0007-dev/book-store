async function loadCart() {
  const res = await fetch('/api/cart', { credentials: 'include' });
  const data = await res.json();
  const container = document.getElementById('cartItems');

  if (!data.success || data.items.length === 0) {
    container.innerHTML = '<p class="muted">Your cart is empty. <a href="/books">Browse books</a> or <a href="/exams">exams</a>.</p>';
    document.getElementById('cartTotal').textContent = '0';
    return;
  }

  container.innerHTML = data.items.map((i) => `
    <div class="cart-row">
      <div class="cart-row-cover">
        ${i.coverImage
          ? `<img class="cover-small" src="${i.coverImage}" alt="${i.title}">`
          : `<div class="cover-small cover-small-placeholder">${i.itemType === 'book' ? '📘' : '📝'}</div>`}
      </div>
      <div class="cart-row-info">
        <strong>${i.title}</strong>
        <p class="muted">${i.itemType.toUpperCase()} &middot; ${i.accessType} &middot; Qty ${i.quantity}</p>
      </div>
      <div class="cart-row-end">
        <div class="cart-row-price">TZS ${i.lineTotal}</div>
        <button class="btn btn-small btn-danger" data-remove="${i.id}">Remove</button>
      </div>
    </div>
  `).join('');

  document.getElementById('cartTotal').textContent = data.total;

  document.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch(`/api/cart/${btn.dataset.remove}`, { method: 'DELETE', credentials: 'include' });
      loadCart();
      if (typeof refreshMobileCartBadge === 'function') refreshMobileCartBadge();
    });
  });
}

document.getElementById('checkoutBtn').addEventListener('click', async () => {
  const res = await fetch('/api/orders/checkout', { method: 'POST', credentials: 'include' });
  const data = await res.json();
  if (data.success) {
    window.location.href = `/checkout?orderId=${data.order.id}`;
  } else {
    alert(data.message || 'Checkout failed.');
  }
});

loadCart();
