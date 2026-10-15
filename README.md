# 🇱🇰 Online Food Delivery Platform (Sri Lanka Edition)

A complete, full-featured **Online Food Delivery Platform** tailored for Sri Lanka with **Sri Lankan Rupees (Rs. / LKR)**, role-based access control, telephone OTP verification, and multiple payment methods.

---

## 🌟 Key Updates & Features

### 🇱🇰 1. Sri Lankan Rupees (Rs. / LKR)
- All currency values and menu items are formatted in **Sri Lankan Rupees (Rs.)**.
- Sri Lankan favorites on the menu:
  - Sri Lankan Chicken Cheese Kottu (`Rs. 1,450.00`)
  - Special Seafood Fried Rice (`Rs. 1,650.00`)
  - Double Patty Beef Burger & Fries (`Rs. 1,850.00`)
  - Spicy Crispy Chicken Burger (`Rs. 1,350.00`)
  - Italian Pepperoni Pizza (`Rs. 2,850.00`)
  - Classic Margherita Pizza (`Rs. 2,200.00`)
  - Chilled Iced Milo Dinosaur (`Rs. 650.00`)
  - Warm Molten Lava Chocolate Cake (`Rs. 850.00`)
- Configurable delivery fees (default `Rs. 350.00`) with free delivery over `Rs. 4,500.00`.

---

### 👑 2. Admin vs. User Profile Access Control
- **Strict Role Separation**:
  - Regular users can **only see customer features** (browse food, add to basket, checkout, order tracking).
  - The **⚙️ Admin Portal button is completely hidden** for regular users and guests.
  - Only accounts with role `admin` can see and access the Admin Portal.
  - Direct API access to admin endpoints is strictly blocked with `403 Forbidden` for non-admin accounts.
- **Admin Management Portal**:
  - Admins can **create both new Admin accounts and User accounts** directly inside the Admin Portal.
  - Admins can promote any user to Admin or demote them back to User.
  - Admins can delete accounts.
- **User Self-Registration**:
  - Anyone can register their own customer account via the **Register New Account** tab.
  - Self-registered accounts are automatically assigned the `user` role and verified with telephone OTP.

---

### 🔒 3. Hidden Promotion Codes (Not Visible to Customers)
- The **"View Available Coupons" link has been removed** from the customer view.
- Customers only see an input field: `"Have a Promo Code? [Enter coupon code] [Apply]"`.
- Promo codes remain secret and can only be viewed, created, enabled/disabled, or deleted by **Admins** inside the Admin Portal.

---

### 📱 4. Telephone Number Verification with OTP
- Phone verification on registration and OTP sign-in.
- Generates 6-digit codes with 5-minute expiry.
- Includes instant auto-fill button for fast testing.

---

### 💳 5. Payment Methods
1. **Debit / Credit Card**: Encrypted payment form (Card number, expiry, CVV).
2. **LankaQR / QR Code Payment**: Dynamic QR code generated for banking apps (Commercial Flash, Sampath WePay, HNB, BOC, FriMi, etc.) in Sri Lankan Rupees.
3. **Cash on Delivery (COD)**: Pay Sri Lankan Rupees cash to the delivery rider upon delivery.

---

## 🔑 Default Accounts for Testing

| Role | Telephone Number | Password |
|---|---|---|
| 👑 **Administrator** | `0770000000` | `admin` |
| 👤 **Customer** | `0771234567` | `user123` |

---

## 🚀 Running the Server

```bash
# Start server
node src/server.js
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.
