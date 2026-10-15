const express = require('express');
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { readDb, writeDb } = require('./storage');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// In-memory OTP Store: { [phone]: { otp: '123456', expiresAt: timestamp, attempts: 0 } }
const otpStore = {};

// Clean phone helper
function cleanPhone(phone) {
  if (!phone) return '';
  return phone.toString().replace(/[\s\-\(\)\+]/g, '');
}

// ==========================================
// 1. CONFIG & SYSTEM SETTINGS API
// ==========================================
app.get('/api/config', (req, res) => {
  const db = readDb();
  res.json({
    success: true,
    system: db.system
  });
});

app.put('/api/admin/config', (req, res) => {
  const { adminPhone, taxPercentage, deliveryFee, freeDeliveryThreshold, restaurantName, currencySymbol } = req.body;
  const db = readDb();

  // Validate admin rights
  const requester = db.users.find(u => cleanPhone(u.phone) === cleanPhone(adminPhone));
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin privileges required' });
  }

  if (taxPercentage !== undefined) {
    const parsedTax = parseFloat(taxPercentage);
    if (isNaN(parsedTax) || parsedTax < 0 || parsedTax > 100) {
      return res.status(400).json({ success: false, message: 'Tax percentage must be between 0 and 100.' });
    }
    db.system.taxPercentage = parsedTax;
  }

  if (deliveryFee !== undefined) {
    db.system.deliveryFee = Math.max(0, parseFloat(deliveryFee) || 0);
  }

  if (freeDeliveryThreshold !== undefined) {
    db.system.freeDeliveryThreshold = Math.max(0, parseFloat(freeDeliveryThreshold) || 0);
  }

  if (restaurantName) {
    db.system.restaurantName = restaurantName;
  }

  if (currencySymbol) {
    db.system.currencySymbol = currencySymbol;
  }

  writeDb(db);
  res.json({
    success: true,
    message: 'System configuration updated successfully',
    system: db.system
  });
});

// ==========================================
// 2. USER AUTHENTICATION & OTP
// ==========================================
app.post('/api/otp/send', (req, res) => {
  let { phone } = req.body;
  phone = cleanPhone(phone);
  if (!phone || phone.length < 7) {
    return res.status(400).json({ success: false, message: 'Please provide a valid telephone number' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 min

  otpStore[phone] = {
    otp,
    expiresAt,
    attempts: 0
  };

  console.log(`[OTP VERIFICATION] Generated OTP for ${phone}: ${otp}`);

  res.json({
    success: true,
    message: `OTP sent successfully to ${phone}!`,
    phone,
    debugOtp: otp,
    expiresInSeconds: 300
  });
});

// Self user account registration
app.post('/api/users/register', (req, res) => {
  let { name, phone, password, otp } = req.body;
  phone = cleanPhone(phone);

  if (!name || !phone || !password || !otp) {
    return res.status(400).json({ success: false, message: 'Name, phone, password, and OTP are required' });
  }

  const record = otpStore[phone];
  if (!record) {
    return res.status(400).json({ success: false, message: 'No OTP requested for this phone or expired' });
  }
  if (Date.now() > record.expiresAt) {
    delete otpStore[phone];
    return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
  }
  if (record.otp !== otp.trim()) {
    record.attempts += 1;
    return res.status(400).json({ success: false, message: 'Invalid OTP code' });
  }

  delete otpStore[phone];

  const db = readDb();
  let existingUser = db.users.find(u => cleanPhone(u.phone) === phone);
  if (existingUser) {
    return res.status(400).json({ success: false, message: 'An account already exists with this phone number. Please login.' });
  }

  const newUser = {
    id: 'usr-' + Date.now(),
    name: name.trim(),
    phone,
    password: password.trim(),
    role: 'user', // Self-registered accounts are always standard users
    addresses: [],
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  writeDb(db);

  // Exclude password in response
  const { password: _, ...userSafe } = newUser;
  res.json({
    success: true,
    message: 'User account created and phone verified successfully!',
    user: userSafe
  });
});

// Login with password or OTP
app.post('/api/users/login', (req, res) => {
  let { phone, password, otp } = req.body;
  phone = cleanPhone(phone);

  if (!phone) {
    return res.status(400).json({ success: false, message: 'Telephone number is required' });
  }

  const db = readDb();
  const user = db.users.find(u => cleanPhone(u.phone) === phone);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Account not found with this phone number. Please register.' });
  }

  // Login via Password
  if (password) {
    if (user.password !== password.trim()) {
      return res.status(400).json({ success: false, message: 'Invalid password' });
    }
  } else if (otp) {
    // Login via OTP verification
    const record = otpStore[phone];
    if (!record || Date.now() > record.expiresAt || record.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP code' });
    }
    delete otpStore[phone];
  } else {
    return res.status(400).json({ success: false, message: 'Please provide either password or OTP code to login' });
  }

  const { password: _, ...userSafe } = user;
  res.json({
    success: true,
    message: `Welcome back, ${user.name}!`,
    user: userSafe
  });
});

// ==========================================
// 3. ADMIN USER & ROLE MANAGEMENT
// ==========================================
// Admin list all accounts
app.get('/api/admin/users', (req, res) => {
  const adminPhone = cleanPhone(req.query.adminPhone);
  const db = readDb();

  const requester = db.users.find(u => cleanPhone(u.phone) === adminPhone);
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  const safeUsers = db.users.map(({ password, ...u }) => u);
  res.json({
    success: true,
    users: safeUsers
  });
});

// Admin create new user or admin account
app.post('/api/admin/users', (req, res) => {
  const { adminPhone, name, phone, password, role } = req.body;
  const db = readDb();

  const requester = db.users.find(u => cleanPhone(u.phone) === cleanPhone(adminPhone));
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Only Admins can create user & admin accounts here' });
  }

  const cleanedTargetPhone = cleanPhone(phone);
  if (!name || !cleanedTargetPhone || !password) {
    return res.status(400).json({ success: false, message: 'Name, phone and password are required' });
  }

  if (db.users.some(u => cleanPhone(u.phone) === cleanedTargetPhone)) {
    return res.status(400).json({ success: false, message: 'Account already exists with this phone number' });
  }

  const newUser = {
    id: 'usr-' + Date.now(),
    name: name.trim(),
    phone: cleanedTargetPhone,
    password: password.trim(),
    role: role === 'admin' ? 'admin' : 'user',
    addresses: [],
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  writeDb(db);

  const { password: _, ...safe } = newUser;
  res.json({
    success: true,
    message: `${newUser.role === 'admin' ? 'Admin' : 'User'} account created successfully for ${newUser.name}`,
    user: safe
  });
});

// Admin toggle role (promote to admin or demote)
app.patch('/api/admin/users/:userId/role', (req, res) => {
  const { adminPhone, role } = req.body;
  const db = readDb();

  const requester = db.users.find(u => cleanPhone(u.phone) === cleanPhone(adminPhone));
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  const user = db.users.find(u => u.id === req.params.userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (user.id === requester.id && role !== 'admin') {
    return res.status(400).json({ success: false, message: 'You cannot revoke your own admin rights' });
  }

  user.role = role === 'admin' ? 'admin' : 'user';
  writeDb(db);

  res.json({
    success: true,
    message: `Account role updated to ${user.role}`,
    user
  });
});

// Admin delete account
app.delete('/api/admin/users/:userId', (req, res) => {
  const adminPhone = cleanPhone(req.query.adminPhone);
  const db = readDb();

  const requester = db.users.find(u => cleanPhone(u.phone) === adminPhone);
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  const target = db.users.find(u => u.id === req.params.userId);
  if (!target) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (target.id === requester.id) {
    return res.status(400).json({ success: false, message: 'Cannot delete your own admin account' });
  }

  db.users = db.users.filter(u => u.id !== req.params.userId);
  writeDb(db);

  res.json({ success: true, message: 'User account removed successfully' });
});

// ==========================================
// 4. ADDRESS MANAGEMENT API
// ==========================================
app.get('/api/user/:phone/addresses', (req, res) => {
  const phone = cleanPhone(req.params.phone);
  const db = readDb();
  const user = db.users.find(u => cleanPhone(u.phone) === phone);
  res.json({
    success: true,
    addresses: user ? (user.addresses || []) : []
  });
});

app.post('/api/user/:phone/addresses', (req, res) => {
  const phone = cleanPhone(req.params.phone);
  const { title, street, city, state, postalCode, landmark, isDefault } = req.body;

  if (!street || !city) {
    return res.status(400).json({ success: false, message: 'Street and City are required' });
  }

  const db = readDb();
  let user = db.users.find(u => cleanPhone(u.phone) === phone);
  if (!user) {
    user = {
      id: 'usr-' + Date.now(),
      phone,
      name: 'Customer',
      role: 'user',
      addresses: [],
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
  }

  if (!user.addresses) user.addresses = [];

  if (isDefault) {
    user.addresses.forEach(a => a.isDefault = false);
  }

  const newAddress = {
    id: 'addr-' + Date.now(),
    title: title || 'Home',
    street,
    city,
    state: state || '',
    postalCode: postalCode || '',
    landmark: landmark || '',
    isDefault: user.addresses.length === 0 ? true : Boolean(isDefault)
  };

  user.addresses.push(newAddress);
  writeDb(db);

  res.json({
    success: true,
    message: 'Address saved successfully',
    addresses: user.addresses,
    address: newAddress
  });
});

// ==========================================
// 5. FOOD MENU & CATALOG API
// ==========================================
app.get('/api/menu', (req, res) => {
  const db = readDb();
  res.json({
    success: true,
    categories: db.categories,
    foods: db.foods
  });
});

app.post('/api/admin/food', (req, res) => {
  const { adminPhone, name, category, price, description, image, prepTime, isVeg } = req.body;
  const db = readDb();

  const requester = db.users.find(u => cleanPhone(u.phone) === cleanPhone(adminPhone));
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  if (!name || !price || !category) {
    return res.status(400).json({ success: false, message: 'Name, price and category are required' });
  }

  const newFood = {
    id: 'food-' + Date.now(),
    name: name.trim(),
    category,
    price: parseFloat(price) || 0,
    description: description || '',
    image: image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80',
    rating: 5.0,
    prepTime: prepTime || '15-20 min',
    isVeg: Boolean(isVeg)
  };

  db.foods.push(newFood);
  writeDb(db);

  res.json({ success: true, message: 'Food item added successfully', food: newFood });
});

app.delete('/api/admin/food/:id', (req, res) => {
  const adminPhone = cleanPhone(req.query.adminPhone);
  const db = readDb();

  const requester = db.users.find(u => cleanPhone(u.phone) === adminPhone);
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  db.foods = db.foods.filter(f => f.id !== req.params.id);
  writeDb(db);
  res.json({ success: true, message: 'Food item deleted successfully' });
});

// ==========================================
// 6. PROMOTION CODES API
// Note: Customer cannot list/view coupon codes.
// Only Admins can view/create in the admin portal.
// ==========================================
app.get('/api/admin/promotions', (req, res) => {
  const adminPhone = cleanPhone(req.query.adminPhone);
  const db = readDb();

  const requester = db.users.find(u => cleanPhone(u.phone) === adminPhone);
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  res.json({
    success: true,
    promoCodes: db.promoCodes
  });
});

app.post('/api/admin/promotions', (req, res) => {
  const { adminPhone, code, discountType, discountValue, minOrder, maxDiscount, expiresAt } = req.body;
  const db = readDb();

  const requester = db.users.find(u => cleanPhone(u.phone) === cleanPhone(adminPhone));
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  if (!code || !discountValue) {
    return res.status(400).json({ success: false, message: 'Promo code and discount value are required' });
  }

  const formattedCode = code.trim().toUpperCase();
  if (db.promoCodes.some(p => p.code === formattedCode)) {
    return res.status(400).json({ success: false, message: 'A promo code with this name already exists' });
  }

  const newPromo = {
    id: 'promo-' + Date.now(),
    code: formattedCode,
    discountType: discountType === 'fixed' ? 'fixed' : 'percentage',
    discountValue: parseFloat(discountValue) || 0,
    minOrder: parseFloat(minOrder) || 0,
    maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
    expiresAt: expiresAt || '2027-12-31',
    isActive: true,
    usageCount: 0
  };

  db.promoCodes.push(newPromo);
  writeDb(db);

  res.json({
    success: true,
    message: `Promo code ${formattedCode} created successfully!`,
    promo: newPromo
  });
});

app.patch('/api/admin/promotions/:id/toggle', (req, res) => {
  const { adminPhone } = req.body;
  const db = readDb();

  const requester = db.users.find(u => cleanPhone(u.phone) === cleanPhone(adminPhone));
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  const promo = db.promoCodes.find(p => p.id === req.params.id);
  if (!promo) {
    return res.status(404).json({ success: false, message: 'Promo code not found' });
  }

  promo.isActive = !promo.isActive;
  writeDb(db);

  res.json({
    success: true,
    message: `Promo code ${promo.code} is now ${promo.isActive ? 'Active' : 'Deactivated'}`,
    promo
  });
});

app.delete('/api/admin/promotions/:id', (req, res) => {
  const adminPhone = cleanPhone(req.query.adminPhone);
  const db = readDb();

  const requester = db.users.find(u => cleanPhone(u.phone) === adminPhone);
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  db.promoCodes = db.promoCodes.filter(p => p.id !== req.params.id);
  writeDb(db);
  res.json({ success: true, message: 'Promo code deleted successfully' });
});

// Customer redeem coupon code (validates secret code without exposing all codes)
app.post('/api/promotions/validate', (req, res) => {
  const { code, subtotal } = req.body;
  if (!code) {
    return res.status(400).json({ success: false, message: 'Please enter a coupon code' });
  }

  const db = readDb();
  const promo = db.promoCodes.find(p => p.code === code.trim().toUpperCase());

  if (!promo) {
    return res.status(404).json({ success: false, message: 'Invalid promotion code' });
  }

  if (!promo.isActive) {
    return res.status(400).json({ success: false, message: 'This promotion code is currently inactive' });
  }

  if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
    return res.status(400).json({ success: false, message: 'This promotion code has expired' });
  }

  const orderAmount = parseFloat(subtotal) || 0;
  if (promo.minOrder && orderAmount < promo.minOrder) {
    return res.status(400).json({
      success: false,
      message: `Minimum order amount of ${db.system.currencySymbol}${promo.minOrder.toFixed(2)} is required for this code`
    });
  }

  let discount = 0;
  if (promo.discountType === 'percentage') {
    discount = (orderAmount * promo.discountValue) / 100;
    if (promo.maxDiscount && discount > promo.maxDiscount) {
      discount = promo.maxDiscount;
    }
  } else {
    discount = Math.min(promo.discountValue, orderAmount);
  }

  res.json({
    success: true,
    message: `Coupon ${promo.code} applied successfully!`,
    promo: {
      code: promo.code,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      calculatedDiscount: Math.round(discount * 100) / 100
    }
  });
});

// ==========================================
// 7. QR CODE PAYMENT GENERATOR (LKR)
// ==========================================
app.post('/api/payment/generate-qr', async (req, res) => {
  try {
    const { amount, phone } = req.body;
    const db = readDb();
    const currency = db.system.currencySymbol || 'Rs. ';

    // Generates Sri Lankan LankaQR / dynamic payment payload
    const paymentPayload = JSON.stringify({
      merchant: db.system.restaurantName,
      lankaQRRef: 'LQR-' + Date.now().toString().slice(-8),
      amount: parseFloat(amount).toFixed(2),
      currency: 'LKR',
      timestamp: new Date().toISOString(),
      customerPhone: phone || 'Guest'
    });

    const qrDataUrl = await QRCode.toDataURL(paymentPayload, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 280,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    res.json({
      success: true,
      qrImage: qrDataUrl,
      paymentPayload,
      amount: parseFloat(amount).toFixed(2),
      currency
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to generate QR code' });
  }
});

// ==========================================
// 8. CHECKOUT & ORDERS
// ==========================================
app.post('/api/orders/checkout', (req, res) => {
  const {
    phone,
    customerName,
    items,
    address,
    paymentMethod,
    cardDetails,
    promoCode,
    deliveryNote
  } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ success: false, message: 'Your basket is empty' });
  }

  const cleanedPhone = cleanPhone(phone);
  if (!cleanedPhone) {
    return res.status(400).json({ success: false, message: 'Phone number is required' });
  }

  if (!address || !address.street || !address.city) {
    return res.status(400).json({ success: false, message: 'Complete delivery address is required' });
  }

  const db = readDb();

  let subtotal = 0;
  const verifiedItems = [];

  for (const item of items) {
    const food = db.foods.find(f => f.id === item.id);
    if (!food) continue;
    const qty = Math.max(1, parseInt(item.quantity) || 1);
    const lineTotal = food.price * qty;
    subtotal += lineTotal;
    verifiedItems.push({
      id: food.id,
      name: food.name,
      price: food.price,
      quantity: qty,
      image: food.image,
      lineTotal: Math.round(lineTotal * 100) / 100
    });
  }

  let discountAmount = 0;
  let appliedPromo = null;
  if (promoCode) {
    const promo = db.promoCodes.find(p => p.code === promoCode.trim().toUpperCase() && p.isActive);
    if (promo) {
      if (!promo.minOrder || subtotal >= promo.minOrder) {
        if (promo.discountType === 'percentage') {
          discountAmount = (subtotal * promo.discountValue) / 100;
          if (promo.maxDiscount && discountAmount > promo.maxDiscount) {
            discountAmount = promo.maxDiscount;
          }
        } else {
          discountAmount = Math.min(promo.discountValue, subtotal);
        }
        appliedPromo = promo.code;
        promo.usageCount = (promo.usageCount || 0) + 1;
      }
    }
  }

  const deliveryFee = subtotal >= db.system.freeDeliveryThreshold ? 0 : db.system.deliveryFee;
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = (taxableAmount * db.system.taxPercentage) / 100;
  const finalTotal = Math.round((taxableAmount + deliveryFee + taxAmount) * 100) / 100;

  let paymentStatus = 'PENDING';
  let paymentDetails = { method: paymentMethod };

  if (paymentMethod === 'card') {
    const cleanCard = (cardDetails?.cardNumber || '').replace(/\s+/g, '');
    if (cleanCard.length < 13) {
      return res.status(400).json({ success: false, message: 'Invalid card number' });
    }
    paymentStatus = 'PAID (Card)';
    paymentDetails = {
      method: 'card',
      cardLast4: cleanCard.slice(-4),
      paidAt: new Date().toISOString()
    };
  } else if (paymentMethod === 'qr') {
    paymentStatus = 'PAID (LankaQR)';
    paymentDetails = {
      method: 'qr',
      qrRef: 'LQR-' + Math.floor(100000 + Math.random() * 900000),
      paidAt: new Date().toISOString()
    };
  } else if (paymentMethod === 'cod') {
    paymentStatus = 'CASH_ON_DELIVERY';
    paymentDetails = {
      method: 'cod',
      note: 'Pay in Sri Lankan Rupees upon delivery'
    };
  }

  const orderId = 'LK-' + Date.now().toString().slice(-6);

  const order = {
    id: orderId,
    phone: cleanedPhone,
    customerName: customerName || 'Valued Customer',
    items: verifiedItems,
    address,
    deliveryNote: deliveryNote || '',
    pricing: {
      subtotal: Math.round(subtotal * 100) / 100,
      appliedPromo,
      discountAmount: Math.round(discountAmount * 100) / 100,
      taxPercentage: db.system.taxPercentage,
      taxAmount: Math.round(taxAmount * 100) / 100,
      deliveryFee: Math.round(deliveryFee * 100) / 100,
      finalTotal
    },
    paymentStatus,
    paymentDetails,
    orderStatus: 'PLACED',
    createdAt: new Date().toISOString(),
    estimatedDeliveryTime: '30-45 mins'
  };

  db.orders.unshift(order);
  writeDb(db);

  res.json({
    success: true,
    message: 'Order placed successfully!',
    order
  });
});

app.get('/api/admin/orders', (req, res) => {
  const adminPhone = cleanPhone(req.query.adminPhone);
  const db = readDb();

  const requester = db.users.find(u => cleanPhone(u.phone) === adminPhone);
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  res.json({ success: true, orders: db.orders });
});

app.patch('/api/admin/orders/:orderId/status', (req, res) => {
  const { adminPhone, status } = req.body;
  const db = readDb();

  const requester = db.users.find(u => cleanPhone(u.phone) === cleanPhone(adminPhone));
  if (!requester || requester.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Access denied: Admin only' });
  }

  const order = db.orders.find(o => o.id === req.params.orderId);
  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  order.orderStatus = status;
  if (status === 'DELIVERED' && order.paymentStatus === 'CASH_ON_DELIVERY') {
    order.paymentStatus = 'PAID (COD Collected)';
  }

  writeDb(db);
  res.json({ success: true, message: `Order status updated to ${status}`, order });
});

app.listen(PORT, () => {
  console.log(`Food Delivery Server running on http://localhost:${PORT}`);
});
