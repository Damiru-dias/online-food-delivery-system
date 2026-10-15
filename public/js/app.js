// App State
const state = {
  system: {
    restaurantName: 'BiteBreeze Food Express (Sri Lanka)',
    currencySymbol: 'Rs. ',
    taxPercentage: 10,
    deliveryFee: 350.00,
    freeDeliveryThreshold: 4500.00
  },
  categories: [],
  foods: [],
  selectedCategory: 'cat-all',
  searchQuery: '',
  cart: {}, // { [foodId]: quantity }
  appliedPromo: null, // { code, discountType, discountValue, calculatedDiscount }
  currentUser: null, // { id, phone, name, role, addresses }
  selectedAddressId: null,
  paymentMethod: 'card',
  adminPromos: [],
  adminFoods: [],
  adminOrders: [],
  adminUsers: []
};

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  loadSavedUser();
  loadSavedCart();
  await fetchSystemConfig();
  await fetchMenu();
  renderCatalog();
  updateCartUI();
  updateAuthUI();
});

// Clean phone helper
function cleanPhone(phone) {
  if (!phone) return '';
  return phone.toString().replace(/[\s\-\(\)\+]/g, '');
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️'}</span> <div>${message}</div>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==========================================
// SYSTEM & MENU API
// ==========================================
async function fetchSystemConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.success) {
      state.system = data.system;
      document.getElementById('nav-brand-title').innerText = state.system.restaurantName;
      document.title = state.system.restaurantName;
      document.getElementById('summary-tax-rate').innerText = state.system.taxPercentage + '%';
      if (state.system.deliveryFee > 0) {
        document.getElementById('free-delivery-note').innerText = `(Free over ${state.system.currencySymbol}${state.system.freeDeliveryThreshold.toFixed(2)})`;
      }
    }
  } catch (err) {
    console.error('Failed to load system config:', err);
  }
}

async function fetchMenu() {
  try {
    const res = await fetch('/api/menu');
    const data = await res.json();
    if (data.success) {
      state.categories = data.categories;
      state.foods = data.foods;
      renderCategories();
    }
  } catch (err) {
    console.error('Failed to load menu:', err);
    showToast('Failed to load Sri Lankan menu items', 'error');
  }
}

function renderCategories() {
  const container = document.getElementById('category-pills');
  container.innerHTML = state.categories.map(cat => `
    <button class="cat-pill ${state.selectedCategory === cat.id ? 'active' : ''}" onclick="selectCategory('${cat.id}')">
      <span>${cat.icon}</span>
      <span>${cat.name}</span>
    </button>
  `).join('');
}

function selectCategory(catId) {
  state.selectedCategory = catId;
  renderCategories();
  renderCatalog();
}

function handleSearchFood() {
  state.searchQuery = document.getElementById('food-search-input').value.trim().toLowerCase();
  renderCatalog();
}

function renderCatalog() {
  const container = document.getElementById('food-catalog-grid');
  let filtered = state.foods;

  if (state.selectedCategory && state.selectedCategory !== 'cat-all') {
    filtered = filtered.filter(f => f.category === state.selectedCategory);
  }

  if (state.searchQuery) {
    filtered = filtered.filter(f =>
      f.name.toLowerCase().includes(state.searchQuery) ||
      f.description.toLowerCase().includes(state.searchQuery)
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem 0; color: var(--text-muted);">
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">🔍</div>
        <h3>No menu items found</h3>
        <p>Try searching another delicious meal or choose another category.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(food => {
    const qtyInCart = state.cart[food.id] || 0;
    return `
      <div class="food-card">
        <div class="food-img-container">
          <img src="${food.image}" alt="${food.name}" loading="lazy">
          <span class="food-veg-badge ${food.isVeg ? 'veg' : 'non-veg'}">
            ${food.isVeg ? '🌱 Veg' : '🥩 Non-Veg'}
          </span>
          <span class="food-rating-badge">★ ${food.rating} (${food.prepTime})</span>
        </div>
        <div class="food-card-body">
          <div class="food-title">${food.name}</div>
          <div class="food-desc">${food.description}</div>
          <div class="food-footer">
            <div class="food-price">${state.system.currencySymbol}${food.price.toFixed(2)}</div>
            ${qtyInCart > 0 ? `
              <div class="qty-control">
                <button class="qty-btn" onclick="updateCartQuantity('${food.id}', -1)">−</button>
                <span style="font-weight: 700; font-size: 0.95rem; min-width: 18px; text-align:center;">${qtyInCart}</span>
                <button class="qty-btn" onclick="updateCartQuantity('${food.id}', 1)">+</button>
              </div>
            ` : `
              <button class="btn btn-outline" style="padding: 0.45rem 0.9rem;" onclick="addToCart('${food.id}')">
                + Add to Basket
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// CART OPERATIONS
// ==========================================
function addToCart(foodId) {
  state.cart[foodId] = (state.cart[foodId] || 0) + 1;
  saveCart();
  renderCatalog();
  updateCartUI();
  showToast('Item added to basket!', 'success');
}

function updateCartQuantity(foodId, change) {
  const current = state.cart[foodId] || 0;
  const next = current + change;
  if (next <= 0) {
    delete state.cart[foodId];
    showToast('Item removed from basket', 'info');
  } else {
    state.cart[foodId] = next;
  }
  saveCart();
  renderCatalog();
  updateCartUI();
}

function saveCart() {
  localStorage.setItem('bitebreeze_cart', JSON.stringify(state.cart));
}

function loadSavedCart() {
  try {
    const raw = localStorage.getItem('bitebreeze_cart');
    if (raw) state.cart = JSON.parse(raw);
  } catch (e) {
    state.cart = {};
  }
}

function calculateTotals() {
  let subtotal = 0;
  let totalCount = 0;

  for (const [id, qty] of Object.entries(state.cart)) {
    const food = state.foods.find(f => f.id === id);
    if (food) {
      subtotal += food.price * qty;
      totalCount += qty;
    }
  }

  let discount = 0;
  if (state.appliedPromo) {
    discount = state.appliedPromo.calculatedDiscount;
    if (discount > subtotal) discount = subtotal;
  }

  const delivery = (subtotal >= state.system.freeDeliveryThreshold || subtotal === 0)
    ? 0
    : state.system.deliveryFee;

  const taxable = Math.max(0, subtotal - discount);
  const tax = (taxable * state.system.taxPercentage) / 100;
  const total = taxable + delivery + tax;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    delivery: Math.round(delivery * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    total: Math.round(total * 100) / 100,
    totalCount
  };
}

function updateCartUI() {
  const totals = calculateTotals();
  const sym = state.system.currencySymbol;

  document.getElementById('nav-cart-count').innerText = totals.totalCount;
  document.getElementById('drawer-items-count').innerText = totals.totalCount;

  const emptyMsg = document.getElementById('cart-empty-message');
  const cartItemsCont = document.getElementById('cart-items-container');
  const checkoutBtn = document.getElementById('checkout-btn');

  if (totals.totalCount === 0) {
    emptyMsg.style.display = 'block';
    cartItemsCont.innerHTML = '';
    checkoutBtn.disabled = true;
    checkoutBtn.style.opacity = '0.5';
  } else {
    emptyMsg.style.display = 'none';
    checkoutBtn.disabled = false;
    checkoutBtn.style.opacity = '1';

    cartItemsCont.innerHTML = Object.entries(state.cart).map(([id, qty]) => {
      const food = state.foods.find(f => f.id === id);
      if (!food) return '';
      const lineTotal = (food.price * qty).toFixed(2);
      return `
        <div class="cart-item-row">
          <div class="cart-item-info">
            <img src="${food.image}" alt="${food.name}">
            <div>
              <div class="cart-item-title">${food.name}</div>
              <div class="cart-item-price">${sym}${food.price.toFixed(2)} × ${qty} = <strong>${sym}${lineTotal}</strong></div>
            </div>
          </div>
          <div class="qty-control">
            <button class="qty-btn" onclick="updateCartQuantity('${food.id}', -1)">−</button>
            <span style="font-weight: 700; font-size: 0.95rem; min-width: 18px; text-align:center;">${qty}</span>
            <button class="qty-btn" onclick="updateCartQuantity('${food.id}', 1)">+</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Summary Table in Sri Lankan Rupees
  document.getElementById('summary-subtotal').innerText = `${sym}${totals.subtotal.toFixed(2)}`;

  const discountRow = document.getElementById('summary-discount-row');
  if (totals.discount > 0) {
    discountRow.style.display = 'flex';
    document.getElementById('summary-discount').innerText = `-${sym}${totals.discount.toFixed(2)}`;
  } else {
    discountRow.style.display = 'none';
  }

  document.getElementById('summary-delivery').innerText = totals.delivery === 0 ? 'FREE' : `${sym}${totals.delivery.toFixed(2)}`;
  document.getElementById('summary-tax').innerText = `${sym}${totals.tax.toFixed(2)}`;
  document.getElementById('summary-total').innerText = `${sym}${totals.total.toFixed(2)}`;
  document.getElementById('checkout-final-total').innerText = `${sym}${totals.total.toFixed(2)}`;
}

function toggleCartDrawer(open) {
  const drawer = document.getElementById('cart-drawer');
  const backdrop = document.getElementById('cart-drawer-backdrop');
  if (open) {
    drawer.classList.add('open');
    backdrop.style.display = 'block';
    setTimeout(() => backdrop.style.opacity = '1', 10);
  } else {
    drawer.classList.remove('open');
    backdrop.style.opacity = '0';
    setTimeout(() => backdrop.style.display = 'none', 300);
  }
}

// ==========================================
// PROMOTION CODES
// Note: Available coupons are NOT displayed to customers!
// ==========================================
async function applyPromoCode() {
  const input = document.getElementById('cart-promo-input');
  const code = input.value.trim().toUpperCase();
  if (!code) {
    showToast('Please type your coupon code', 'error');
    return;
  }

  const totals = calculateTotals();
  if (totals.subtotal <= 0) {
    showToast('Add food items to your basket before applying a coupon', 'error');
    return;
  }

  try {
    const res = await fetch('/api/promotions/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, subtotal: totals.subtotal })
    });

    const data = await res.json();
    if (data.success) {
      state.appliedPromo = data.promo;
      showToast(data.message, 'success');
      const alertBox = document.getElementById('applied-promo-alert');
      alertBox.style.display = 'block';
      alertBox.innerHTML = `<span style="color: var(--success); font-weight: 700;">✓ Applied: ${data.promo.code} (-${state.system.currencySymbol}${data.promo.calculatedDiscount.toFixed(2)})</span> <button onclick="removePromoCode()" style="background:none; border:none; color:var(--danger); cursor:pointer; margin-left: 8px;">✕ Remove</button>`;
      updateCartUI();
    } else {
      showToast(data.message || 'Invalid coupon code', 'error');
    }
  } catch (err) {
    showToast('Failed to validate promo code', 'error');
  }
}

function removePromoCode() {
  state.appliedPromo = null;
  document.getElementById('cart-promo-input').value = '';
  document.getElementById('applied-promo-alert').style.display = 'none';
  updateCartUI();
  showToast('Coupon code removed', 'info');
}

// ==========================================
// USER AUTH, OTP & ROLES (Admin vs User)
// ==========================================
let pendingPhone = '';
let currentGeneratedOtp = '';
let pendingProceedToCheckout = false;

function loadSavedUser() {
  try {
    const raw = localStorage.getItem('bitebreeze_user');
    if (raw) {
      state.currentUser = JSON.parse(raw);
    }
  } catch (e) {
    state.currentUser = null;
  }
}

function updateAuthUI() {
  const label = document.getElementById('auth-btn-label');
  const adminNavBtn = document.getElementById('admin-nav-btn');

  if (state.currentUser && state.currentUser.phone) {
    label.innerText = state.currentUser.name || state.currentUser.phone;

    // ADMIN PORTAL ONLY VISIBLE IF CURRENT USER IS AN ADMIN
    if (state.currentUser.role === 'admin') {
      adminNavBtn.style.display = 'inline-flex';
    } else {
      adminNavBtn.style.display = 'none';
    }
  } else {
    label.innerText = 'Login / Register';
    adminNavBtn.style.display = 'none';
  }
}

function openAuthModal() {
  const modal = document.getElementById('auth-modal');
  modal.classList.add('active');

  const tabs = document.getElementById('auth-choice-tabs');
  const viewLogin = document.getElementById('auth-view-login');
  const viewRegister = document.getElementById('auth-view-register');
  const viewOtpLogin = document.getElementById('auth-view-otp-login');
  const viewProfile = document.getElementById('auth-view-profile');

  if (state.currentUser) {
    tabs.style.display = 'none';
    viewLogin.style.display = 'none';
    viewRegister.style.display = 'none';
    viewOtpLogin.style.display = 'none';
    viewProfile.style.display = 'block';

    document.getElementById('user-profile-name').innerText = state.currentUser.name || 'User';
    document.getElementById('user-profile-phone').innerText = `Phone: ${state.currentUser.phone}`;

    const badge = document.getElementById('user-role-badge');
    if (state.currentUser.role === 'admin') {
      badge.innerText = '👑 Administrator';
      badge.style.background = '#fef3c7';
      badge.style.color = '#92400e';
      document.getElementById('admin-shortcut-box').style.display = 'block';
    } else {
      badge.innerText = '👤 Customer';
      badge.style.background = '#dcfce7';
      badge.style.color = '#166534';
      document.getElementById('admin-shortcut-box').style.display = 'none';
    }
  } else {
    tabs.style.display = 'flex';
    viewProfile.style.display = 'none';
    viewOtpLogin.style.display = 'none';
    switchAuthMode('login');
  }
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.remove('active');
}

function switchAuthMode(mode) {
  const btnLogin = document.getElementById('tab-btn-login');
  const btnReg = document.getElementById('tab-btn-register');
  const viewLogin = document.getElementById('auth-view-login');
  const viewRegister = document.getElementById('auth-view-register');
  const viewOtpLogin = document.getElementById('auth-view-otp-login');

  viewOtpLogin.style.display = 'none';

  if (mode === 'login') {
    btnLogin.classList.add('active');
    btnReg.classList.remove('active');
    viewLogin.style.display = 'block';
    viewRegister.style.display = 'none';
  } else {
    btnReg.classList.add('active');
    btnLogin.classList.remove('active');
    viewRegister.style.display = 'block';
    viewLogin.style.display = 'none';
  }
}

// User Self-Registration with OTP Verification
async function requestRegisterOtp() {
  const phone = document.getElementById('reg-phone').value.trim();
  if (!phone) {
    showToast('Please enter your Sri Lankan phone number', 'error');
    return;
  }

  try {
    const res = await fetch('/api/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });

    const data = await res.json();
    if (data.success) {
      currentGeneratedOtp = data.debugOtp;
      document.getElementById('reg-debug-otp').innerText = data.debugOtp;
      document.getElementById('reg-otp-section').style.display = 'block';
      showToast(`Verification OTP sent to ${data.phone}`, 'success');
    } else {
      showToast(data.message || 'Failed to send OTP', 'error');
    }
  } catch (err) {
    showToast('Error requesting OTP', 'error');
  }
}

function autoFillRegOtp() {
  if (currentGeneratedOtp) {
    document.getElementById('reg-otp-code').value = currentGeneratedOtp;
    showToast('OTP auto-filled', 'info');
  }
}

async function submitUserRegistration() {
  const name = document.getElementById('reg-name').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const password = document.getElementById('reg-password').value.trim();
  const otp = document.getElementById('reg-otp-code').value.trim();

  if (!name || !phone || !password) {
    showToast('Please fill in name, phone and password', 'error');
    return;
  }

  if (!otp) {
    showToast('Please request and enter telephone OTP verification code', 'error');
    return;
  }

  try {
    const res = await fetch('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, password, otp })
    });

    const data = await res.json();
    if (data.success) {
      state.currentUser = data.user;
      localStorage.setItem('bitebreeze_user', JSON.stringify(data.user));
      updateAuthUI();
      showToast('Registration successful! Welcome to BiteBreeze.', 'success');
      closeAuthModal();

      if (pendingProceedToCheckout) {
        pendingProceedToCheckout = false;
        proceedToCheckout();
      }
    } else {
      showToast(data.message || 'Registration failed', 'error');
    }
  } catch (err) {
    showToast('Registration error occurred', 'error');
  }
}

// User Login (Password or OTP)
async function submitPasswordLogin() {
  const phone = document.getElementById('login-phone').value.trim();
  const password = document.getElementById('login-password').value.trim();

  if (!phone || !password) {
    showToast('Please enter both telephone and password', 'error');
    return;
  }

  try {
    const res = await fetch('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password })
    });

    const data = await res.json();
    if (data.success) {
      state.currentUser = data.user;
      localStorage.setItem('bitebreeze_user', JSON.stringify(data.user));
      updateAuthUI();
      showToast(data.message, 'success');
      closeAuthModal();

      if (pendingProceedToCheckout) {
        pendingProceedToCheckout = false;
        proceedToCheckout();
      }
    } else {
      showToast(data.message || 'Login failed', 'error');
    }
  } catch (err) {
    showToast('Login request error', 'error');
  }
}

async function startOtpLoginFlow() {
  const phone = document.getElementById('login-phone').value.trim();
  if (!phone) {
    showToast('Please enter your telephone number first', 'error');
    return;
  }

  try {
    const res = await fetch('/api/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });

    const data = await res.json();
    if (data.success) {
      pendingPhone = data.phone;
      currentGeneratedOtp = data.debugOtp;

      document.getElementById('auth-choice-tabs').style.display = 'none';
      document.getElementById('auth-view-login').style.display = 'none';
      document.getElementById('auth-view-register').style.display = 'none';
      document.getElementById('auth-view-otp-login').style.display = 'block';

      document.getElementById('otp-login-target-phone').innerText = data.phone;
      document.getElementById('debug-otp-display').innerText = data.debugOtp;

      document.querySelectorAll('.otp-digit').forEach(el => el.value = '');
      document.querySelectorAll('.otp-digit')[0].focus();

      showToast(`Verification OTP sent to ${data.phone}`, 'success');
    } else {
      showToast(data.message || 'Failed to send OTP', 'error');
    }
  } catch (err) {
    showToast('Error sending OTP', 'error');
  }
}

function quickFillOtp() {
  if (!currentGeneratedOtp) return;
  const digits = currentGeneratedOtp.split('');
  const inputs = document.querySelectorAll('.otp-digit');
  digits.forEach((digit, index) => {
    if (inputs[index]) inputs[index].value = digit;
  });
  showToast('OTP auto-filled', 'info');
}

function handleOtpInput(input, index) {
  if (input.value.length === 1 && index < 6) {
    const next = input.nextElementSibling;
    if (next) next.focus();
  }
  const inputs = document.querySelectorAll('.otp-digit');
  let code = '';
  inputs.forEach(i => code += i.value);
  if (code.length === 6) {
    submitOtpLogin();
  }
}

async function submitOtpLogin() {
  const inputs = document.querySelectorAll('.otp-digit');
  let otp = '';
  inputs.forEach(i => otp += i.value);

  if (otp.length < 6) {
    showToast('Please enter full 6-digit OTP code', 'error');
    return;
  }

  try {
    const res = await fetch('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: pendingPhone, otp })
    });

    const data = await res.json();
    if (data.success) {
      state.currentUser = data.user;
      localStorage.setItem('bitebreeze_user', JSON.stringify(data.user));
      updateAuthUI();
      showToast(data.message, 'success');
      closeAuthModal();

      if (pendingProceedToCheckout) {
        pendingProceedToCheckout = false;
        proceedToCheckout();
      }
    } else {
      showToast(data.message || 'OTP Login failed', 'error');
    }
  } catch (err) {
    showToast('Verification failed', 'error');
  }
}

function logoutUser() {
  state.currentUser = null;
  localStorage.removeItem('bitebreeze_user');
  updateAuthUI();
  closeAuthModal();
  showToast('Logged out successfully', 'info');
}

// ==========================================
// CHECKOUT & DELIVERY ADDRESSES
// ==========================================
async function proceedToCheckout() {
  const totals = calculateTotals();
  if (totals.totalCount === 0) {
    showToast('Your basket is empty', 'error');
    return;
  }

  if (!state.currentUser) {
    showToast('Please login or create an account to proceed', 'info');
    pendingProceedToCheckout = true;
    toggleCartDrawer(false);
    openAuthModal();
    return;
  }

  toggleCartDrawer(false);
  document.getElementById('checkout-customer-name').innerText = state.currentUser.name || 'Customer';
  document.getElementById('checkout-customer-phone').innerText = state.currentUser.phone;

  await loadUserAddresses();
  selectPaymentMethod('card');
  document.getElementById('checkout-modal').classList.add('active');
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.remove('active');
}

async function loadUserAddresses() {
  try {
    const res = await fetch(`/api/user/${cleanPhone(state.currentUser.phone)}/addresses`);
    const data = await res.json();
    const listCont = document.getElementById('checkout-address-list');

    if (data.success && data.addresses.length > 0) {
      state.currentUser.addresses = data.addresses;
      listCont.innerHTML = data.addresses.map((addr, idx) => `
        <label style="display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.6rem; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 0.4rem; cursor: pointer; background: #fff;">
          <input type="radio" name="checkout_addr" value="${addr.id}" ${idx === 0 ? 'checked' : ''} onchange="state.selectedAddressId = '${addr.id}'" style="margin-top: 3px;">
          <div>
            <strong>${addr.title}</strong>
            <div style="font-size: 0.82rem; color: var(--text-muted);">${addr.street}, ${addr.city} ${addr.postalCode ? '- ' + addr.postalCode : ''}</div>
          </div>
        </label>
      `).join('');
      state.selectedAddressId = data.addresses[0].id;
    } else {
      listCont.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">No address saved yet. Please add a Sri Lankan delivery address below.</p>`;
      document.getElementById('add-address-form-box').style.display = 'block';
    }
  } catch (err) {
    console.error(err);
  }
}

function toggleAddAddressForm() {
  const box = document.getElementById('add-address-form-box');
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

async function saveNewCheckoutAddress() {
  const title = document.getElementById('new-addr-title').value.trim() || 'Home';
  const street = document.getElementById('new-addr-street').value.trim();
  const city = document.getElementById('new-addr-city').value.trim();
  const postalCode = document.getElementById('new-addr-postal').value.trim();
  const landmark = document.getElementById('new-addr-landmark').value.trim();

  if (!street || !city) {
    showToast('Street and City are required for delivery', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/user/${cleanPhone(state.currentUser.phone)}/addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, street, city, postalCode, landmark, isDefault: true })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Address saved successfully!', 'success');
      document.getElementById('add-address-form-box').style.display = 'none';
      document.getElementById('new-addr-street').value = '';
      document.getElementById('new-addr-city').value = '';
      document.getElementById('new-addr-postal').value = '';
      document.getElementById('new-addr-landmark').value = '';
      await loadUserAddresses();
    } else {
      showToast(data.message || 'Could not save address', 'error');
    }
  } catch (err) {
    showToast('Failed to save address', 'error');
  }
}

// ==========================================
// PAYMENT METHOD SWITCHER (CARD, LANKAQR, COD)
// ==========================================
async function selectPaymentMethod(method) {
  state.paymentMethod = method;

  document.querySelectorAll('.pay-card').forEach(c => c.classList.remove('active'));
  document.getElementById(`pay-method-${method}`).classList.add('active');

  const cardBox = document.getElementById('payment-fields-card');
  const qrBox = document.getElementById('payment-fields-qr');
  const codBox = document.getElementById('payment-fields-cod');

  cardBox.style.display = 'none';
  qrBox.style.display = 'none';
  codBox.style.display = 'none';

  if (method === 'card') {
    cardBox.style.display = 'block';
  } else if (method === 'qr') {
    qrBox.style.display = 'block';
    await generatePaymentQrCode();
  } else if (method === 'cod') {
    codBox.style.display = 'block';
  }
}

async function generatePaymentQrCode() {
  const totals = calculateTotals();
  document.getElementById('qr-modal-amount').innerText = `${state.system.currencySymbol}${totals.total.toFixed(2)}`;

  try {
    const res = await fetch('/api/payment/generate-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: totals.total,
        phone: state.currentUser ? state.currentUser.phone : 'Guest'
      })
    });

    const data = await res.json();
    if (data.success) {
      document.getElementById('checkout-qr-image').src = data.qrImage;
    }
  } catch (err) {
    console.error('Failed to generate LankaQR code:', err);
  }
}

// ==========================================
// ORDER SUBMISSION
// ==========================================
async function submitFinalOrder() {
  const totals = calculateTotals();
  if (totals.totalCount === 0) return;

  const userAddresses = state.currentUser ? (state.currentUser.addresses || []) : [];
  const selectedAddr = userAddresses.find(a => a.id === state.selectedAddressId) || userAddresses[0];

  if (!selectedAddr) {
    showToast('Please add and select a delivery address', 'error');
    return;
  }

  let cardDetails = null;
  if (state.paymentMethod === 'card') {
    const cardHolder = document.getElementById('card-holder-name').value.trim() || state.currentUser.name;
    const cardNumber = document.getElementById('card-number').value.replace(/\s+/g, '');
    const expiry = document.getElementById('card-expiry').value.trim();
    const cvv = document.getElementById('card-cvv').value.trim();

    if (!cardNumber || !expiry || !cvv) {
      showToast('Please complete all card details', 'error');
      return;
    }
    cardDetails = { cardHolder, cardNumber, expiry, cvv };
  }

  const items = Object.entries(state.cart).map(([id, quantity]) => ({ id, quantity }));
  const deliveryNote = document.getElementById('checkout-delivery-note').value.trim();

  const payload = {
    phone: state.currentUser.phone,
    customerName: state.currentUser.name,
    items,
    address: selectedAddr,
    paymentMethod: state.paymentMethod,
    cardDetails,
    promoCode: state.appliedPromo ? state.appliedPromo.code : null,
    deliveryNote
  };

  const btn = document.getElementById('btn-place-order');
  btn.disabled = true;
  btn.innerText = 'Processing Order...';

  try {
    const res = await fetch('/api/orders/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      state.cart = {};
      state.appliedPromo = null;
      saveCart();
      renderCatalog();
      updateCartUI();

      closeCheckoutModal();

      document.getElementById('success-order-id').innerText = data.order.id;
      document.getElementById('success-order-status').innerText = data.order.orderStatus;
      document.getElementById('success-order-payment').innerText = data.order.paymentStatus;
      document.getElementById('success-order-time').innerText = data.order.estimatedDeliveryTime;
      document.getElementById('success-order-address').innerText = `${data.order.address.title}: ${data.order.address.street}, ${data.order.address.city}`;

      document.getElementById('order-success-modal').classList.add('active');
    } else {
      showToast(data.message || 'Order placement failed', 'error');
    }
  } catch (err) {
    showToast('Failed to place order. Try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerText = 'Place Order Now';
  }
}

function closeSuccessModal() {
  document.getElementById('order-success-modal').classList.remove('active');
}

// ==========================================
// ADMIN PORTAL (ONLY FOR ROLE === 'ADMIN')
// ==========================================
function openAdminModal() {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    showToast('Access Denied: Only Admin accounts can access this portal.', 'error');
    return;
  }

  document.getElementById('admin-modal').classList.add('active');
  loadAdminUsers();
  loadAdminSettings();
  loadAdminPromos();
  loadAdminFoods();
  loadAdminOrders();
}

function closeAdminModal() {
  document.getElementById('admin-modal').classList.remove('active');
}

function switchAdminTab(tabId, btn) {
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

  btn.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

// 1. Admin Users & Accounts Management
async function loadAdminUsers() {
  if (!state.currentUser || state.currentUser.role !== 'admin') return;
  try {
    const res = await fetch(`/api/admin/users?adminPhone=${cleanPhone(state.currentUser.phone)}`);
    const data = await res.json();
    if (data.success) {
      state.adminUsers = data.users;
      renderAdminUsers();
    }
  } catch (e) {
    console.error(e);
  }
}

function toggleNewUserForm() {
  const form = document.getElementById('new-user-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function submitAdminCreateUser() {
  const role = document.getElementById('admin-create-role').value;
  const name = document.getElementById('admin-create-name').value.trim();
  const phone = document.getElementById('admin-create-phone').value.trim();
  const password = document.getElementById('admin-create-pass').value.trim();

  if (!name || !phone || !password) {
    showToast('Name, phone and password are required', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminPhone: state.currentUser.phone,
        name,
        phone,
        password,
        role
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      document.getElementById('admin-create-name').value = '';
      document.getElementById('admin-create-phone').value = '';
      document.getElementById('admin-create-pass').value = '';
      toggleNewUserForm();
      loadAdminUsers();
    } else {
      showToast(data.message || 'Creation failed', 'error');
    }
  } catch (e) {
    showToast('Failed to create account', 'error');
  }
}

async function toggleUserRole(userId, currentRole) {
  const newRole = currentRole === 'admin' ? 'user' : 'admin';
  try {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminPhone: state.currentUser.phone,
        role: newRole
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadAdminUsers();
    } else {
      showToast(data.message || 'Failed to update role', 'error');
    }
  } catch (e) {
    showToast('Error changing role', 'error');
  }
}

async function deleteUserAccount(userId) {
  if (!confirm('Are you sure you want to delete this account?')) return;
  try {
    const res = await fetch(`/api/admin/users/${userId}?adminPhone=${cleanPhone(state.currentUser.phone)}`, {
      method: 'DELETE'
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      loadAdminUsers();
    } else {
      showToast(data.message || 'Failed to delete account', 'error');
    }
  } catch (e) {
    showToast('Error deleting account', 'error');
  }
}

function renderAdminUsers() {
  const tbody = document.getElementById('admin-users-tbody');
  tbody.innerHTML = state.adminUsers.map(u => {
    const isAdmin = u.role === 'admin';
    return `
      <tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 0.6rem;"><strong>${u.name}</strong></td>
        <td style="padding: 0.6rem;">${u.phone}</td>
        <td style="padding: 0.6rem;">
          <span style="display:inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 800; background: ${isAdmin ? '#fef3c7' : '#dcfce7'}; color: ${isAdmin ? '#92400e' : '#166534'};">
            ${isAdmin ? '👑 ADMIN' : '👤 USER'}
          </span>
        </td>
        <td style="padding: 0.6rem; color: var(--text-muted); font-size: 0.8rem;">
          ${new Date(u.createdAt).toLocaleDateString()}
        </td>
        <td style="padding: 0.6rem;">
          <button class="btn btn-outline" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;" onclick="toggleUserRole('${u.id}', '${u.role}')">
            ${isAdmin ? 'Demote to User' : 'Promote to Admin'}
          </button>
          <button class="btn btn-danger" style="font-size: 0.75rem; padding: 0.2rem 0.5rem; margin-left: 4px;" onclick="deleteUserAccount('${u.id}')">
            Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// 2. Admin System & Tax Settings
function loadAdminSettings() {
  document.getElementById('admin-tax-percent').value = state.system.taxPercentage;
  document.getElementById('admin-delivery-fee').value = state.system.deliveryFee;
  document.getElementById('admin-free-threshold').value = state.system.freeDeliveryThreshold;
  document.getElementById('admin-restaurant-name').value = state.system.restaurantName;
}

async function saveAdminSettings() {
  const taxPercentage = parseFloat(document.getElementById('admin-tax-percent').value);
  const deliveryFee = parseFloat(document.getElementById('admin-delivery-fee').value);
  const freeDeliveryThreshold = parseFloat(document.getElementById('admin-free-threshold').value);
  const restaurantName = document.getElementById('admin-restaurant-name').value.trim();

  try {
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminPhone: state.currentUser.phone,
        taxPercentage,
        deliveryFee,
        freeDeliveryThreshold,
        restaurantName
      })
    });

    const data = await res.json();
    if (data.success) {
      state.system = data.system;
      showToast('Sri Lankan tax & delivery rates saved!', 'success');
      document.getElementById('nav-brand-title').innerText = state.system.restaurantName;
      document.getElementById('summary-tax-rate').innerText = state.system.taxPercentage + '%';
      updateCartUI();
    } else {
      showToast(data.message || 'Update failed', 'error');
    }
  } catch (err) {
    showToast('Failed to save settings', 'error');
  }
}

// 3. Admin Promos
async function loadAdminPromos() {
  try {
    const res = await fetch(`/api/admin/promotions?adminPhone=${cleanPhone(state.currentUser.phone)}`);
    const data = await res.json();
    if (data.success) {
      state.adminPromos = data.promoCodes;
      renderAdminPromos();
    }
  } catch (e) {
    console.error(e);
  }
}

function toggleNewPromoForm() {
  const form = document.getElementById('new-promo-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function submitNewPromoCode() {
  const code = document.getElementById('new-promo-code').value.trim();
  const discountType = document.getElementById('new-promo-type').value;
  const discountValue = parseFloat(document.getElementById('new-promo-val').value);
  const minOrder = parseFloat(document.getElementById('new-promo-min').value) || 0;
  const maxDiscount = parseFloat(document.getElementById('new-promo-max').value) || null;
  const expiresAt = document.getElementById('new-promo-expiry').value;

  if (!code || isNaN(discountValue)) {
    showToast('Promo code and discount value are required', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminPhone: state.currentUser.phone,
        code,
        discountType,
        discountValue,
        minOrder,
        maxDiscount,
        expiresAt
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Promo code ${data.promo.code} created!`, 'success');
      document.getElementById('new-promo-code').value = '';
      document.getElementById('new-promo-val').value = '';
      toggleNewPromoForm();
      loadAdminPromos();
    } else {
      showToast(data.message || 'Creation failed', 'error');
    }
  } catch (e) {
    showToast('Failed to create promo code', 'error');
  }
}

async function togglePromoStatus(id) {
  try {
    const res = await fetch(`/api/admin/promotions/${id}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPhone: state.currentUser.phone })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'info');
      loadAdminPromos();
    }
  } catch (e) {
    showToast('Failed to toggle promo code', 'error');
  }
}

async function deletePromoCode(id) {
  if (!confirm('Are you sure you want to delete this promotion code?')) return;
  try {
    const res = await fetch(`/api/admin/promotions/${id}?adminPhone=${cleanPhone(state.currentUser.phone)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast('Promo code deleted', 'success');
      loadAdminPromos();
    }
  } catch (e) {
    showToast('Failed to delete promo code', 'error');
  }
}

function renderAdminPromos() {
  const tbody = document.getElementById('admin-promos-tbody');
  tbody.innerHTML = state.adminPromos.map(p => `
    <tr style="border-bottom: 1px solid var(--border);">
      <td style="padding: 0.6rem;"><strong>${p.code}</strong></td>
      <td style="padding: 0.6rem;">${p.discountType === 'percentage' ? p.discountValue + '%' : state.system.currencySymbol + p.discountValue}</td>
      <td style="padding: 0.6rem;">${state.system.currencySymbol}${p.minOrder}</td>
      <td style="padding: 0.6rem;">
        <span style="display:inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: bold; background: ${p.isActive ? '#dcfce7' : '#fee2e2'}; color: ${p.isActive ? '#15803d' : '#b91c1c'};">
          ${p.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td style="padding: 0.6rem;">
        <button class="btn btn-outline" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;" onclick="togglePromoStatus('${p.id}')">
          ${p.isActive ? 'Deactivate' : 'Activate'}
        </button>
        <button class="btn btn-danger" style="font-size: 0.75rem; padding: 0.2rem 0.5rem; margin-left: 4px;" onclick="deletePromoCode('${p.id}')">
          Delete
        </button>
      </td>
    </tr>
  `).join('');
}

// 4. Admin Foods
async function loadAdminFoods() {
  await fetchMenu();
  const tbody = document.getElementById('admin-food-tbody');
  tbody.innerHTML = state.foods.map(f => `
    <tr style="border-bottom: 1px solid var(--border);">
      <td style="padding: 0.6rem; display: flex; align-items: center; gap: 8px;">
        <img src="${f.image}" style="width: 32px; height: 32px; border-radius: 6px; object-fit: cover;">
        <strong>${f.name}</strong>
      </td>
      <td style="padding: 0.6rem;">${f.category.replace('cat-', '')}</td>
      <td style="padding: 0.6rem;">${state.system.currencySymbol}${f.price.toFixed(2)}</td>
      <td style="padding: 0.6rem;">
        <button class="btn btn-danger" style="font-size: 0.75rem; padding: 0.2rem 0.5rem;" onclick="deleteFoodItem('${f.id}')">
          Delete
        </button>
      </td>
    </tr>
  `).join('');
}

function toggleNewFoodForm() {
  const form = document.getElementById('new-food-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function submitNewFoodItem() {
  const name = document.getElementById('new-food-name').value.trim();
  const category = document.getElementById('new-food-cat').value;
  const price = parseFloat(document.getElementById('new-food-price').value);
  const image = document.getElementById('new-food-img').value.trim();
  const description = document.getElementById('new-food-desc').value.trim();

  if (!name || isNaN(price)) {
    showToast('Name and price are required', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminPhone: state.currentUser.phone,
        name,
        category,
        price,
        image,
        description
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast('Menu item added!', 'success');
      document.getElementById('new-food-name').value = '';
      document.getElementById('new-food-price').value = '';
      toggleNewFoodForm();
      await loadAdminFoods();
      renderCatalog();
    }
  } catch (e) {
    showToast('Failed to add food item', 'error');
  }
}

async function deleteFoodItem(id) {
  if (!confirm('Are you sure you want to delete this menu item?')) return;
  try {
    const res = await fetch(`/api/admin/food/${id}?adminPhone=${cleanPhone(state.currentUser.phone)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      showToast('Menu item removed', 'success');
      await loadAdminFoods();
      renderCatalog();
    }
  } catch (e) {
    showToast('Failed to delete food item', 'error');
  }
}

// 5. Admin Orders
async function loadAdminOrders() {
  try {
    const res = await fetch(`/api/admin/orders?adminPhone=${cleanPhone(state.currentUser.phone)}`);
    const data = await res.json();
    if (data.success) {
      state.adminOrders = data.orders;
      renderAdminOrders();
    }
  } catch (e) {
    console.error(e);
  }
}

function renderAdminOrders() {
  const tbody = document.getElementById('admin-orders-tbody');
  if (state.adminOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding: 1.5rem; text-align: center; color: var(--text-muted);">No orders placed yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.adminOrders.map(o => `
    <tr style="border-bottom: 1px solid var(--border);">
      <td style="padding: 0.6rem;"><strong>${o.id}</strong></td>
      <td style="padding: 0.6rem;">${o.customerName}<br><small style="color:var(--text-muted);">${o.phone}</small></td>
      <td style="padding: 0.6rem;">${o.items.map(i => `${i.name} (×${i.quantity})`).join(', ')}</td>
      <td style="padding: 0.6rem;"><strong>${state.system.currencySymbol}${o.pricing.finalTotal.toFixed(2)}</strong></td>
      <td style="padding: 0.6rem;">
        <span style="font-size: 0.75rem; font-weight: 700; color: ${o.paymentStatus.includes('PAID') ? 'var(--success)' : '#d97706'}">
          ${o.paymentDetails.method.toUpperCase()} (${o.paymentStatus})
        </span>
      </td>
      <td style="padding: 0.6rem;">
        <select onchange="updateOrderStatus('${o.id}', this.value)" style="font-size: 0.8rem; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border);">
          <option value="PLACED" ${o.orderStatus === 'PLACED' ? 'selected' : ''}>PLACED</option>
          <option value="PREPARING" ${o.orderStatus === 'PREPARING' ? 'selected' : ''}>PREPARING</option>
          <option value="OUT_FOR_DELIVERY" ${o.orderStatus === 'OUT_FOR_DELIVERY' ? 'selected' : ''}>OUT_FOR_DELIVERY</option>
          <option value="DELIVERED" ${o.orderStatus === 'DELIVERED' ? 'selected' : ''}>DELIVERED</option>
          <option value="CANCELLED" ${o.orderStatus === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option>
        </select>
      </td>
    </tr>
  `).join('');
}

async function updateOrderStatus(orderId, status) {
  try {
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminPhone: state.currentUser.phone,
        status
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Order status updated to ${status}`, 'success');
      loadAdminOrders();
    }
  } catch (e) {
    showToast('Failed to update status', 'error');
  }
}
