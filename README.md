# Elegance — Women's Fashion E-commerce Platform

A complete Django-based e-commerce platform for **Elegance**, a women's clothing brand selling stitched, semi-stitched, unstitched, and ready-made garments.

The project is designed with a clean separation of responsibilities using only three core Django applications:

* `UserDetial` — users, profiles, mobile verification, addresses
* `Product` — categories, sub-categories, product types, products, dynamic attributes
* `Order` — carts, cart items, orders, payments, order status, invoices

The system is designed to support both **guest users and authenticated users**, dynamic product attributes, COD with partial payment, online payment through Razorpay, order tracking, email notifications, and an administrative dashboard.

---

# 1. Project Overview

## Brand

**Elegance**

## Business Type

Women's clothing / fashion e-commerce.

## Main Product Categories

### 1. Stitched

Products that are already stitched and ready for use.

### 2. Semi-Stitched

Products that require some tailoring/adjustment before use.

### 3. Unstitched

Fabric/material sold for custom tailoring.

### 4. Ready-Mades

Ready-to-wear products.

Ready-Made sub-categories:

* Salwar Suits
* Tops / Shirts
* Co-ord Sets

---

# 2. Product Classification

The product structure supports both direct category relationships and sub-category relationships.

### Basic relationship

```text
Category
   └── Product
```

Example:

```text
Stitched
   └── Designer Kurta
```

### Sub-category relationship

```text
Category
   └── Sub Category
          └── Product
```

Example:

```text
Ready-Mades
   └── Salwar Suits
          └── Embroidered Salwar Suit
```

A product may belong directly to a category or may belong to a sub-category under a category.

The product architecture should therefore **not force every product to have a sub-category**.

---

# 3. Product Types

Every product can optionally have a product type.

Available types:

* Casual Wear
* Work Wear
* Semi-Formal Wear
* Formal Wear / Occasion Wear
* Trousseau Collection

Product type is optional.

For example:

```text
Category:
Ready-Mades

Sub Category:
Salwar Suits

Product:
Embroidered Silk Suit

Type:
Trousseau Collection
```

Another product could simply be:

```text
Category:
Stitched

Sub Category:
None

Product:
Cotton Kurta

Type:
Casual Wear
```

---

# 4. Dynamic Product Attributes

Product attributes must be completely dynamic.

The system should **not hard-code fields such as color, size, fabric, pattern, sleeve type, etc.**

Different products can have completely different attributes.

For example:

### Product A — Kurta

```text
Color:
  Red
  Blue
  Green

Size:
  S
  M
  L
  XL

Fabric:
  Cotton
```

### Product B — Saree

```text
Color:
  Pink

Fabric:
  Silk

Border:
  Zari

Length:
  6.3 Meter
```

### Product C — Unstitched Suit Material

```text
Fabric:
  Cotton

Work:
  Embroidery

Dupatta:
  Included
```

The database should therefore support:

```text
Attribute
    └── Attribute Values
```

and products should be able to select applicable attributes/values.

---

# 5. Important Product Attribute Concept

Dynamic attributes should support two concepts:

### Attribute Definition

Examples:

```text
Color
Size
Fabric
Pattern
Sleeve
Occasion
Work
Length
```

### Attribute Value

Examples:

```text
Color
 ├── Red
 ├── Blue
 └── Green

Size
 ├── S
 ├── M
 ├── L
 └── XL

Fabric
 ├── Cotton
 ├── Silk
 └── Rayon
```

This allows the admin to create new attributes without changing Django models.

---

# 6. Django Application Structure

The project should contain exactly three business applications.

```text
Elegance/
│
├── manage.py
│
├── Elegance/
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py
│   ├── asgi.py
│   └── wsgi.py
│
├── UserDetial/
│   ├── migrations/
│   ├── admin.py
│   ├── apps.py
│   ├── forms.py
│   ├── models.py
│   ├── urls.py
│   ├── views.py
│   └── ...
│
├── Product/
│   ├── migrations/
│   ├── admin.py
│   ├── apps.py
│   ├── forms.py
│   ├── models.py
│   ├── urls.py
│   ├── views.py
│   └── ...
│
├── Order/
│   ├── migrations/
│   ├── admin.py
│   ├── apps.py
│   ├── forms.py
│   ├── models.py
│   ├── urls.py
│   ├── views.py
│   └── ...
│
├── templates/
│   ├── base.html
│   │
│   ├── home/
│   │
│   ├── product/
│   │
│   ├── cart/
│   │
│   ├── checkout/
│   │
│   ├── orders/
│   │
│   ├── account/
│   │
│   └── emails/
│
├── static/
│   ├── css/
│   ├── js/
│   └── images/
│
├── media/
│   └── products/
│
├── requirements.txt
└── README.md
```

---

# 7. Application Responsibilities

## UserDetial

Responsible for:

* User profile
* Mobile number
* Mobile OTP verification
* Addresses
* Default address
* Account pages
* User order history references
* User account-related functionality

---

## Product

Responsible for:

* Categories
* Sub-categories
* Product types
* Products
* Product images
* Dynamic attributes
* Attribute values
* Product inventory/stock
* Product pricing
* Product detail information
* Product filtering
* Shop listing

---

## Order

Responsible for:

* Guest carts
* User carts
* Cart items
* Cart merging
* Checkout
* Orders
* Order items
* Payment information
* COD partial payments
* Online payment
* Order statuses
* Invoice information
* Order-related emails
* Return/replacement contact functionality

---

# 8. User Flow

The ideal customer journey is:

```text
Homepage
    ↓
Shop
    ↓
Product Listing
    ↓
Product Detail
    ↓
Add to Cart
    ↓
Cart
    ↓
Checkout
    ↓
Customer Information
    ↓
Mobile OTP Verification
    ↓
Address
    ↓
Payment Method
    ↓
Order Creation
    ↓
Order Confirmation
    ↓
Order Detail
```

---

# 9. Guest User Cart

Guest users must be able to add products to their cart without creating an account.

A cart should be associated with the user's **Django session key**.

> Important: the CSRF token should **not** be used as the cart identifier. CSRF tokens are intended for request protection and should not be treated as persistent user/session identity. Use Django's session key instead.

Example:

```text
Guest Browser
     ↓
Django Session
     ↓
session_key = abc123...
     ↓
Cart
     ↓
Cart Items
```

The guest cart can therefore remain available while the visitor browses the website.

---

# 10. Guest Cart → User Cart Merge

When a guest user logs in or completes the mobile verification/account process, the system should check whether a cart exists for the current session.

Example:

```text
Guest Cart

Session:
ABC123

Items:
Kurta × 1
Co-ord Set × 2
```

User logs in:

```text
User:
Rahul/Customer ID

Existing User Cart:
Dress × 1
```

The system merges the guest cart into the authenticated user's cart.

Final cart:

```text
Kurta × 1
Co-ord Set × 2
Dress × 1
```

The guest cart should then be marked inactive/cleared.

The merge logic must also handle duplicate products/cart items correctly.

---

# 11. User Account

The account section should contain:

```text
My Account
│
├── Profile
│
├── My Orders
│   ├── Order List
│   └── Order Detail
│
├── Addresses
│   ├── Address List
│   ├── Add Address
│   ├── Edit Address
│   ├── Delete Address
│   └── Set Default Address
│
└── Logout
```

---

# 12. Mobile Verification

For the current development version, OTP verification will be mocked.

No SMS API is required at this stage.

Flow:

```text
Enter Mobile Number
        ↓
Bootstrap OTP Modal
        ↓
Generate OTP
        ↓
Print OTP in Console
        ↓
Return OTP to Frontend
        ↓
Auto-fill OTP
        ↓
Verify OTP
        ↓
Continue
```

Example development console:

```text
Generated OTP for 9876543210: 482193
```

The OTP should **not** be treated as production-secure authentication in this development phase.

Later, an SMS provider can be integrated without redesigning the checkout/account flow.

---

# 13. Account Creation Flow

When the user opens the account page and is not authenticated:

```text
Account Page
     ↓
Bootstrap Modal
     ↓
Enter Mobile Number
     ↓
Generate OTP
     ↓
Print OTP in Console
     ↓
OTP Verification
     ↓
Create / Get User
     ↓
Login
     ↓
Account Dashboard
```

If the mobile number already exists:

```text
Mobile Number
      ↓
Existing User
      ↓
OTP Verification
      ↓
Login
```

If it does not exist:

```text
Mobile Number
      ↓
New User
      ↓
OTP Verification
      ↓
Create User
      ↓
Login
```

---

# 14. Checkout Flow

Checkout should collect:

### Customer Information

* First Name
* Last Name
* Mobile Number

Mobile number verification should happen through the Bootstrap OTP modal.

### Address

The user can:

* Select an existing address
* Select the default address
* Add a new address

### Payment Method

Two payment methods are supported.

---

# 15. Payment Methods

## COD — Partial Payment

COD does not mean the entire order is unpaid.

The customer pays **20% of the total order value online/in advance** and the remaining **80% is payable through COD**.

Example:

```text
Order Total: ₹5,000

Advance Payment: ₹1,000
COD Amount: ₹4,000
```

Order payment information should therefore store values such as:

```text
Order Total
Advance Required
Amount Paid
Remaining Amount
Payment Method
Payment Status
```

---

# 16. Full Online Payment

The second payment option is:

```text
Full Online Payment
```

The intended gateway is:

**Razorpay**

For the initial development phase, Razorpay integration does not need to be implemented.

The backend should nevertheless be structured so that Razorpay can later be added without changing the core order architecture.

Expected future flow:

```text
Checkout
   ↓
Create Pending Order
   ↓
Create Razorpay Payment
   ↓
Customer Pays
   ↓
Payment Verification
   ↓
Mark Payment Successful
   ↓
Confirm Order
```

---

# 17. Order Architecture

An order should contain a snapshot of the customer's purchase.

The order should not depend exclusively on the current product information because products can change after an order is placed.

For example:

```text
Order
│
├── Customer
├── Billing Address
├── Shipping Address
├── Payment Method
├── Payment Status
├── Order Status
├── Total
├── Amount Paid
├── Amount Remaining
│
└── Order Items
      ├── Product
      ├── Product Name Snapshot
      ├── SKU Snapshot
      ├── Price Snapshot
      ├── Quantity
      ├── Selected Attributes
      └── Total
```

This ensures historical orders remain accurate even if the product is later edited or deleted.

---

# 18. Order Status

Velocity integration is intentionally postponed.

For now, the admin manually updates order statuses.

Suggested statuses:

```text
Pending
Confirmed
Processing
Packed
Shipped
Out for Delivery
Delivered
Cancelled
```

The system should be designed so that Velocity can later be integrated.

Future architecture:

```text
Django
   ↓
Velocity API
   ↓
Shipment Created
   ↓
Tracking Number
   ↓
Status Updates
   ↓
Django Order
```

For the current version, all status changes happen through the admin dashboard.

---

# 19. Order Detail — Customer Side

The customer should be able to open:

```text
My Account
    ↓
My Orders
    ↓
Order Detail
```

Order detail should show:

### Order Information

* Order ID
* Order Date
* Order Status
* Payment Method
* Payment Status

### Products

* Product image
* Product name
* Selected attributes
* Quantity
* Price
* Total

### Shipping Address

Complete delivery address.

### Payment Summary

```text
Subtotal
Discount
Shipping
Order Total
Amount Paid
Amount Remaining
```

### Delivery Status

Example:

```text
✓ Order Placed
✓ Confirmed
✓ Packed
✓ Shipped
→ Out for Delivery
○ Delivered
```

---

# 20. Return / Replacement

No return or replacement management system is required at this stage.

Instead, the order detail page should display a contact option.

Example:

```text
Need to return or replace this order?

Contact us on WhatsApp
```

The WhatsApp link should include the order ID.

Conceptually:

```text
https://wa.me/9999999999?text=Want%20to%20return%20an%20order%20with%20id%20%7Border_id%7D
```

The actual production number should be configured through Django settings rather than hard-coded into templates.

---

# 21. Homepage

The homepage should contain:

* Hero/banner section
* Featured collections
* Main categories
* Ready-Made categories
* Featured products
* New arrivals
* Occasion/Trousseau collection
* Promotional sections
* Shop CTA
* Footer

Suggested category navigation:

```text
Shop
├── Stitched
├── Semi-Stitched
├── Unstitched
└── Ready-Mades
    ├── Salwar Suits
    ├── Tops / Shirts
    └── Co-ord Sets
```

---

# 22. Shop Page

The shop page should support:

* Product listing
* Category filtering
* Sub-category filtering
* Product type filtering
* Dynamic attribute filtering
* Price filtering
* Sorting
* Pagination
* Search

Example:

```text
Shop

Filters
├── Category
├── Sub Category
├── Type
├── Color
├── Size
├── Fabric
└── Price

Sort By
├── Newest
├── Price Low → High
├── Price High → Low
└── Popular
```

Dynamic attributes should automatically become available as filters where applicable.

---

# 23. Product Detail Page

The product detail page should contain:

* Product gallery
* Product name
* Product description
* Price
* Discounted price if applicable
* SKU
* Stock status
* Dynamic attributes
* Attribute selections
* Quantity selector
* Add to Cart
* Buy Now
* Related products

Example:

```text
Embroidered Co-ord Set

₹3,499

Color:
○ Black
○ Beige
○ Pink

Size:
○ S
○ M
○ L
○ XL

Quantity:
[-] 1 [+]

[ Add to Cart ]
[ Buy Now ]
```

---

# 24. Cart Page

Cart should show:

```text
Product
Quantity
Price
Subtotal
```

Features:

* Increase quantity
* Decrease quantity
* Remove item
* Product image
* Selected attributes
* Cart subtotal
* Checkout button

The cart must work for:

* Guest users
* Logged-in users

---

# 25. Suggested Core Models

The exact model implementation can be refined during development, but the conceptual structure should be:

## UserDetial

```text
UserProfile
    ├── User
    ├── Mobile Number
    ├── Mobile Verified
    └── Profile Information

Address
    ├── User
    ├── Name
    ├── Mobile
    ├── Address Line 1
    ├── Address Line 2
    ├── City
    ├── State
    ├── Pincode
    ├── Landmark
    └── Is Default
```

---

# 26. Product Models

Conceptually:

```text
Category
    ├── Name
    ├── Slug
    └── Active

SubCategory
    ├── Category
    ├── Name
    ├── Slug
    └── Active

ProductType
    ├── Name
    ├── Slug
    └── Active

Product
    ├── Category
    ├── SubCategory (Optional)
    ├── ProductType (Optional)
    ├── Name
    ├── Slug
    ├── SKU
    ├── Description
    ├── Price
    ├── Sale Price
    ├── Stock
    ├── Active
    └── Created At
```

Dynamic attributes:

```text
Attribute
    ├── Name
    └── Slug

AttributeValue
    ├── Attribute
    ├── Value
    └── Slug

ProductAttributeValue
    ├── Product
    └── AttributeValue
```

Product images:

```text
ProductImage
    ├── Product
    ├── Image
    ├── Alt Text
    ├── Sort Order
    └── Is Primary
```

---

# 27. Order Models

Conceptually:

```text
Cart
    ├── User (Optional)
    ├── Session Key (Optional)
    ├── Active
    └── Created At

CartItem
    ├── Cart
    ├── Product
    ├── Quantity
    └── Selected Attributes
```

Order:

```text
Order
    ├── User
    ├── Order Number
    ├── First Name
    ├── Last Name
    ├── Mobile
    ├── Shipping Address Snapshot
    ├── Billing Address Snapshot
    ├── Subtotal
    ├── Discount
    ├── Shipping Charge
    ├── Total
    ├── Amount Paid
    ├── Amount Remaining
    ├── Payment Method
    ├── Payment Status
    ├── Order Status
    └── Created At
```

Order items:

```text
OrderItem
    ├── Order
    ├── Product
    ├── Product Name
    ├── SKU
    ├── Unit Price
    ├── Quantity
    ├── Selected Attributes
    └── Total Price
```

---

# 28. Payment Data

The payment architecture should support both current and future payment integrations.

Suggested conceptual structure:

```text
Payment
    ├── Order
    ├── Method
    ├── Amount
    ├── Status
    ├── Transaction ID
    ├── Gateway
    ├── Gateway Order ID
    ├── Gateway Payment ID
    └── Created At
```

Possible methods:

```text
COD_PARTIAL
ONLINE_FULL
```

Possible statuses:

```text
PENDING
PARTIAL
PAID
FAILED
REFUNDED
```

---

# 29. Admin Dashboard

The admin dashboard should provide complete management functionality.

## Product Management

Admin can:

* Add product
* Edit product
* Delete/deactivate product
* Upload product images
* Manage price
* Manage sale price
* Manage stock
* Manage SKU
* Assign category
* Assign optional sub-category
* Assign optional type
* Assign dynamic attributes

---

# 30. Category Management

Admin can manage:

```text
Categories
├── Stitched
├── Semi-Stitched
├── Unstitched
└── Ready-Mades
```

Sub-categories:

```text
Ready-Mades
├── Salwar Suits
├── Tops / Shirts
└── Co-ord Sets
```

The admin should be able to create additional categories/sub-categories later.

---

# 31. Product Type Management

Admin should be able to add/edit/delete product types.

Initial types:

```text
Casual Wear
Work Wear
Semi-Formal Wear
Formal Wear / Occasion Wear
Trousseau Collection
```

Product types should be database records rather than hard-coded choices.

This allows the admin to add future types without changing code.

---

# 32. Dynamic Attribute Management

Admin should be able to manage:

```text
Attributes
├── Color
├── Size
├── Fabric
├── Pattern
├── Sleeve
└── etc.
```

And their values:

```text
Color
├── Red
├── Blue
├── Black
└── Pink
```

```text
Size
├── S
├── M
├── L
└── XL
```

When adding/editing a product, the admin can select whichever attributes apply to that product.

---

# 33. Order Management

Admin should have an order dashboard.

Example:

```text
Orders

#ELG-10001    ₹4,999    Processing
#ELG-10002    ₹2,499    Shipped
#ELG-10003    ₹7,999    Delivered
#ELG-10004    ₹3,299    Out for Delivery
```

Admin can open an order and see:

* Customer
* Mobile
* Email if available
* Shipping address
* Products
* Quantities
* Prices
* Selected attributes
* Order total
* Amount paid
* Remaining amount
* Payment method
* Payment status
* Order status
* Order timeline

Admin can manually update:

```text
Pending
Confirmed
Processing
Packed
Shipped
Out for Delivery
Delivered
Cancelled
```

---

# 34. Reporting

The admin dashboard should include basic reporting.

Suggested reports:

### Sales

* Total sales
* Today's sales
* Weekly sales
* Monthly sales
* Yearly sales

### Orders

* Total orders
* Pending orders
* Processing orders
* Delivered orders
* Cancelled orders

### Payments

* Online payments
* COD orders
* COD amount remaining
* Partial payments
* Fully paid orders

### Products

* Total products
* Active products
* Out-of-stock products
* Low-stock products
* Best-selling products

### Customers

* Total customers
* New customers
* Repeat customers

---

# 35. Email Notifications

The system should send email notifications for important order events.

Required notifications:

```text
Order Placed
Order Confirmed
Order Shipped
Out for Delivery
Order Delivered
Invoice
```

Example:

```text
Customer
   ↓
Order Placed
   ↓
Email
   ↓
Order Confirmation + Invoice
```

For status changes:

```text
Admin changes status
        ↓
Out for Delivery
        ↓
Email Customer
```

Email templates should be kept separately from application logic.

Example:

```text
templates/
└── emails/
    ├── order_placed.html
    ├── order_confirmed.html
    ├── order_shipped.html
    ├── out_for_delivery.html
    ├── order_delivered.html
    └── invoice.html
```

---

# 36. Invoice

The order system should support an invoice representation.

Invoice should contain:

* Elegance branding
* Invoice/order number
* Customer information
* Shipping address
* Product details
* Quantity
* Unit price
* Subtotal
* Discount
* Shipping
* Total
* Amount paid
* Amount remaining
* Payment method
* Order date

The invoice can initially be provided as an HTML page/email attachment flow, with PDF generation added if required.

---

# 37. URL Structure

Suggested URL structure:

```text
/
```

Homepage.

```text
/shop/
```

Shop.

```text
/product/<slug>/
```

Product detail.

```text
/cart/
```

Cart.

```text
/checkout/
```

Checkout.

```text
/account/
```

Account dashboard.

```text
/account/profile/
```

Profile.

```text
/account/orders/
```

Past orders.

```text
/account/orders/<order_number>/
```

Order detail.

```text
/account/addresses/
```

Addresses.

```text
/account/addresses/add/
```

Add address.

```text
/account/addresses/<id>/edit/
```

Edit address.

---

# 38. Admin URLs

Django's admin can initially be used as the backend administration system.

```text
/admin/
```

The admin should expose:

```text
Products
Categories
Sub Categories
Product Types
Attributes
Attribute Values
Product Images

Users
Profiles
Addresses

Carts
Cart Items

Orders
Order Items
Payments
```

A custom dashboard can later be added if required.

---

# 39. Frontend

The initial frontend should use:

* HTML
* CSS
* Bootstrap
* Bootstrap Modals
* JavaScript
* Django Templates

Bootstrap modals should be used for:

* Mobile number verification
* OTP verification
* Confirmation dialogs
* Other small interactive flows

The frontend should remain server-rendered through Django templates wherever practical.

---

# 40. Security Requirements

The project must follow Django security practices.

Important requirements:

* Use Django CSRF protection
* Do not use CSRF tokens as cart identifiers
* Use Django session keys for guest carts
* Validate all form submissions server-side
* Validate product availability before checkout
* Recalculate cart totals on the server
* Never trust prices sent from the frontend
* Never trust payment amounts sent from the frontend
* Validate stock before creating an order
* Prevent users from accessing another user's orders
* Prevent users from modifying another user's addresses
* Keep Razorpay secrets in environment variables
* Keep email credentials in environment variables
* Keep WhatsApp number/configuration in settings/environment variables
* Do not expose production OTPs in frontend responses

---

# 41. Order Pricing Rule

The frontend must never be considered authoritative for pricing.

For example, even if the browser sends:

```text
price = ₹1
```

the backend must retrieve the current valid product price from the database.

The backend should calculate:

```text
Product Price
×
Quantity
=
Item Total
```

Then:

```text
Subtotal
+
Shipping
-
Discount
=
Order Total
```

And finally:

### COD

```text
Order Total × 20%
=
Advance Payment

Order Total - Advance Payment
=
COD Amount
```

### Full Online

```text
Order Total
=
Online Payment
```

---

# 42. Inventory Handling

At checkout, the backend should verify that sufficient stock exists.

Example:

```text
Available Stock: 5
Requested Quantity: 3
```

Order can proceed.

But:

```text
Available Stock: 2
Requested Quantity: 3
```

Order should be rejected with an appropriate message.

Stock should be updated as part of the order process according to the final inventory strategy.

For a robust implementation, inventory changes should happen inside a database transaction to avoid race conditions.

---

# 43. Checkout Transaction

Order creation should use a database transaction.

Conceptually:

```text
Begin Transaction
       ↓
Validate Cart
       ↓
Validate Stock
       ↓
Calculate Prices
       ↓
Create Order
       ↓
Create Order Items
       ↓
Create Payment Record
       ↓
Update Inventory
       ↓
Clear Cart
       ↓
Commit Transaction
```

If any critical operation fails:

```text
Rollback
```

This prevents partially-created orders.

---

# 44. Development Payment Behaviour

During the initial development stage:

### COD

Selecting COD should directly create the order with:

```text
Payment Method:
COD_PARTIAL

Amount Paid:
20%

Amount Remaining:
80%

Payment Status:
PARTIAL
```

### Online

Since Razorpay is not integrated yet, selecting online payment can simulate a successful payment.

Example:

```text
Payment Method:
ONLINE_FULL

Payment Status:
PAID

Amount Paid:
100%
```

This is only for development/testing.

Real Razorpay verification must be implemented before production.

---

# 45. Development OTP Behaviour

For development:

```text
POST Mobile Number
       ↓
Generate OTP
       ↓
Print OTP to Django Console
       ↓
Return OTP to frontend
       ↓
Auto-fill OTP
       ↓
Verify
```

Example:

```text
[OTP DEBUG] Mobile: 9876543210 | OTP: 581294
```

Production must replace this with a proper SMS/OTP service.

---

# 46. Recommended Settings

Sensitive configuration should be environment-based.

Example environment variables:

```text
SECRET_KEY=
DEBUG=
ALLOWED_HOSTS=

DATABASE_URL=

EMAIL_HOST=
EMAIL_PORT=
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

WHATSAPP_NUMBER=
```

Do not commit secrets into Git.

---

# 47. Suggested Development Requirements

The project can initially use:

```text
Django
Pillow
python-dotenv
```

And later:

```text
razorpay
```

when the real payment integration is implemented.

Additional packages should only be introduced when they solve a concrete project requirement.

---

# 48. Database Relationship Overview

The high-level database relationship is:

```text
                    ┌──────────────┐
                    │   Category   │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ SubCategory  │
                    └──────┬───────┘
                           │
                           │
┌──────────────┐    ┌──────▼───────┐    ┌──────────────┐
│ ProductType  │───►│    Product   │◄───│   Category   │
└──────────────┘    └──────┬───────┘    └──────────────┘
                           │
                    ┌──────▼──────────┐
                    │ ProductAttribute│
                    └──────┬──────────┘
                           │
                    ┌──────▼───────┐
                    │ AttributeValue│
                    └───────────────┘


┌──────────────┐
│     User     │
└──────┬───────┘
       │
 ┌─────┴──────────┐
 │                │
 ▼                ▼
Profile         Address


┌──────────────┐
│ User / Guest │
└──────┬───────┘
       │
       ▼
     Cart
       │
       ▼
   CartItem
       │
       ▼
    Product


     User
       │
       ▼
     Order
       │
 ┌─────┴────────────┐
 │                  │
 ▼                  ▼
OrderItem         Payment
 │
 ▼
Product
```

---

# 49. Complete Customer Journey

The complete intended experience is:

```text
                    HOME
                     │
                     ▼
                   SHOP
                     │
                     ▼
              PRODUCT DETAIL
                     │
                     ▼
                ADD TO CART
                     │
             ┌───────┴────────┐
             │                │
        Guest User        Logged User
             │                │
             ▼                ▼
       Session Cart        User Cart
             │                │
             └───────┬────────┘
                     ▼
                    CART
                     │
                     ▼
                 CHECKOUT
                     │
                     ▼
             Customer Details
                     │
                     ▼
              Mobile Verification
                     │
                     ▼
                  Address
                     │
                     ▼
              Payment Method
                     │
             ┌───────┴────────┐
             │                │
           COD             Online
             │                │
          20% Paid        100% Paid
             │                │
             └───────┬────────┘
                     ▼
                CREATE ORDER
                     │
                     ▼
              ORDER CONFIRMED
                     │
                     ▼
                ORDER DETAIL
                     │
                     ▼
          ┌──────────────────────┐
          │ Admin Updates Status │
          └──────────┬───────────┘
                     │
                     ▼
              OUT FOR DELIVERY
                     │
                     ▼
                  DELIVERED
```

---

# 50. Admin Journey

```text
Admin Login
    ↓
Dashboard
    │
    ├── Products
    │     ├── Add
    │     ├── Edit
    │     ├── Delete
    │     └── Stock
    │
    ├── Categories
    │
    ├── Sub Categories
    │
    ├── Product Types
    │
    ├── Attributes
    │
    ├── Customers
    │
    ├── Orders
    │     └── Update Status
    │
    └── Reports
```

---

# 51. Future Integrations

The architecture should leave room for:

### Razorpay

For real online payments.

### Velocity

For:

* Shipment creation
* Tracking ID
* Courier information
* Delivery status synchronization

### SMS Provider

For real OTP delivery.

### WhatsApp

For return/replacement communication.

None of these integrations are required for the first development version.

---

# 52. Development Principles

The project should follow these principles:

### Keep the three apps focused

```text
UserDetial → User-related functionality

Product → Product/catalog functionality

Order → Cart/order/payment functionality
```

### Avoid unnecessary duplication

Business logic should be placed in reusable service/helper functions instead of duplicated across views.

### Keep pricing server-side

Never trust frontend prices.

### Keep order history immutable

Orders should preserve historical product/customer/payment information.

### Keep dynamic attributes database-driven

Do not create new database fields for every new product attribute.

### Keep payment providers replaceable

Razorpay should be an implementation detail, not something deeply coupled to order creation.

### Keep delivery providers replaceable

Velocity should be integrated later through a separate service layer.

---

# 53. MVP Scope

The first version should include:

* [x] Homepage
* [x] Shop
* [x] Product detail
* [x] Categories
* [x] Sub-categories
* [x] Product types
* [x] Dynamic product attributes
* [x] Product images
* [x] Guest cart
* [x] User cart
* [x] Guest-to-user cart merge
* [x] Checkout
* [x] Mock mobile OTP
* [x] User account
* [x] Profile
* [x] Addresses
* [x] Default address
* [x] Orders
* [x] Order detail
* [x] COD 20% advance logic
* [x] Mock online payment
* [x] Manual order status management
* [x] Email notification architecture
* [x] Invoice architecture
* [x] WhatsApp return/replacement link
* [x] Django admin
* [x] Basic reporting

---

# 54. Later Enhancements

After the MVP is stable, the following can be added:

* Razorpay integration
* Velocity integration
* Real SMS OTP
* Advanced search
* Wishlist
* Coupons
* Product reviews
* Customer notifications
* Advanced analytics
* Abandoned cart emails
* Inventory history
* Multiple product variants
* Automated invoice PDF generation
* Return/replacement management
* Refund management
* Delivery tracking page

---

# 55. Final Architecture

The overall architecture should remain simple:

```text
                         ELEGANCE
                            │
             ┌──────────────┼──────────────┐
             │              │              │
             ▼              ▼              ▼
        UserDetial       Product         Order
             │              │              │
             │              │              │
       User/Profile      Catalog        Cart
       Addresses         Products       Checkout
       OTP               Categories     Orders
                         Attributes     Payments
                         Types          Status
                                        Invoice
                                        Emails
             │              │              │
             └──────────────┼──────────────┘
                            │
                            ▼
                         Django
                            │
                ┌───────────┼───────────┐
                │           │           │
                ▼           ▼           ▼
             Database     Email       Future APIs
                                      │
                                  ┌───┴────┐
                                  │        │
                              Razorpay  Velocity
```

---

# 56. Project Goal

The goal of the Elegance project is to build a **production-ready foundation for a women's fashion e-commerce platform** while keeping the initial implementation simple.

The first release should provide a complete shopping experience:

```text
Browse
  ↓
Discover
  ↓
Select
  ↓
Cart
  ↓
Checkout
  ↓
Verify Mobile
  ↓
Address
  ↓
Payment
  ↓
Order
  ↓
Track
  ↓
Delivery
```

while giving the Elegance administration team complete control over:

```text
Products
Categories
Sub-Categories
Product Types
Dynamic Attributes
Stock
Orders
Payments
Order Status
Customers
Reports
```

The architecture is intentionally designed so that **Razorpay, Velocity, real SMS OTP, advanced reporting, and other third-party services can be added later without restructuring the fundamental Django applications.**
