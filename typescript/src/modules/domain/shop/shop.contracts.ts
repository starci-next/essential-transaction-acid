export interface CheckoutLine {
    productId: string
    qty: number
}

export interface CheckoutInput {
    orderId: string
    customerId: string
    /** One line per product, no product twice (the door checks). */
    lines: ReadonlyArray<CheckoutLine>
    voucher?: string
}

/** Whether the order's voucher code was applied, and why not. */
export type VoucherOutcome = { applied: true; code: string } | { applied: false; code: string; reason: "USED" }

/** The answer to a placed order (HTTP 201). The customer pays `total` = `subtotal` - `discount`. */
export interface PlacedOrder {
    orderId: string
    subtotal: number
    discount: number
    total: number
    voucher?: VoucherOutcome
}

export interface OrderView {
    id: string
    customer_id: string
    subtotal: number
    discount: number
    items: ReadonlyArray<{ product_id: string; qty: number; unit_price: number }>
    voucher: string | null
}

export interface WalletView {
    customer_id: string
    balance: number
}

export interface StockView {
    product_id: string
    qty: number
}
