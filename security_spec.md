# Security Specification for GGM&S Grocery

## 1. Data Invariants
- A product must have a name, category, price, and unit.
- Price must be a positive number.
- Custom categories and units are managed in a singleton global settings document.
- Only authenticated admins can modify products or settings.

## 2. The "Dirty Dozen" Payloads (PERMISSION_DENIED expected)
1. **Unauthenticated Write**: Attempt to create a product without signing in.
2. **Anonymous Write**: Attempt to create a product as an unverified user.
3. **Ghost Field Poisoning**: Attempt to add `isFeatured: true` to a product when not part of schema.
4. **Price Corruption**: Update product price to -100.
5. **ID Injection**: Create a product with a 2KB document ID.
6. **Self-Promotion**: Non-admin user trying to add themselves to `admins/` collection.
7. **Settings Wipe**: Admin trying to delete the `settings/global` document.
8. **Massive Array**: Adding 10,000 custom categories to settings to cause Denial of Wallet.
9. **Type Mismatch**: Setting `price` to a string "free".
10. **Immutable Field Change**: Attempting to change `createdAt` on an existing product.
11. **Shadow Category**: Setting product category to an empty string.
12. **PII Leak**: Non-admin trying to list all user documents (if any were present).

## 3. Test Runner Logic
The `firestore.rules` will be validated against these scenarios to ensure `PERMISSION_DENIED` for all unauthorized or malformed requests.
