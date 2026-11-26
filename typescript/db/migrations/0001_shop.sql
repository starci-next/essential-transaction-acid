-- The shoe shop's tables. `npm run migrate` (the cli, never the serving app) applies this file once.
--
-- The shop's rules live here, in the database, not in the code: stock never goes below zero, a wallet never goes below
-- zero, a voucher code is redeemed once, an order line points at a real order and a real product. A write that breaks
-- a rule is refused by Postgres, whichever code sent it. The checkout reads the refusal; it never re-checks a rule by
-- reading first.
--
-- Keys are the shop's own codes (`giay-chay-bo`, `c-1`, the order number) so the HTTP contract and the rows read the same.

CREATE TABLE products (
    id    text PRIMARY KEY,
    name  text NOT NULL,
    price bigint NOT NULL CONSTRAINT products_price_positive CHECK (price > 0)
);

CREATE TABLE stock (
    product_id text PRIMARY KEY REFERENCES products (id),
    qty        integer NOT NULL CONSTRAINT stock_qty_not_negative CHECK (qty >= 0)
);

CREATE TABLE wallets (
    customer_id text PRIMARY KEY,
    balance     bigint NOT NULL CONSTRAINT wallets_balance_not_negative CHECK (balance >= 0)
);

CREATE TABLE vouchers (
    code    text PRIMARY KEY,
    percent integer NOT NULL CONSTRAINT vouchers_percent_range CHECK (percent BETWEEN 1 AND 100)
);

-- What the customer pays for an order is subtotal - discount.
CREATE TABLE orders (
    id          text PRIMARY KEY,
    customer_id text NOT NULL REFERENCES wallets (customer_id),
    subtotal    bigint NOT NULL CONSTRAINT orders_subtotal_not_negative CHECK (subtotal >= 0),
    discount    bigint NOT NULL DEFAULT 0 CONSTRAINT orders_discount_range CHECK (discount >= 0 AND discount <= subtotal),
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_customer_id_idx ON orders (customer_id);

CREATE TABLE order_items (
    order_id   text NOT NULL REFERENCES orders (id),
    product_id text NOT NULL REFERENCES products (id),
    qty        integer NOT NULL CONSTRAINT order_items_qty_positive CHECK (qty > 0),
    unit_price bigint NOT NULL,
    PRIMARY KEY (order_id, product_id)
);
CREATE INDEX order_items_product_id_idx ON order_items (product_id);

-- One code per order, one order per code (the UNIQUE constraint on `code`).
CREATE TABLE voucher_redemptions (
    order_id text PRIMARY KEY REFERENCES orders (id),
    code     text NOT NULL REFERENCES vouchers (code) CONSTRAINT voucher_redemptions_code_once UNIQUE
);
