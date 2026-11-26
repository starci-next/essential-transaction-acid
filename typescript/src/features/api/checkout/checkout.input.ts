import { randomUUID } from "node:crypto"
import { type CheckoutInput, type CheckoutLine, ShopError, ShopErrorCode } from "../../../modules/domain/shop"

const bad = (field: string): ShopError => new ShopError({ code: ShopErrorCode.BadField, params: { field } })

const text = (value: unknown, field: string): string => {
    if (typeof value !== "string" || value.trim() === "" || value.length > 100) throw bad(field)
    return value
}

const positiveInt = (value: unknown, field: string): number => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw bad(field)
    return value
}

/** The body of `POST /checkout` as a `CheckoutInput`; a malformed body is refused here, before it reaches the database. */
export const checkoutInputOf = (raw: unknown): CheckoutInput => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw bad("body")
    const body = raw as Record<string, unknown>
    if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > 20) throw bad("lines")
    const lines: CheckoutLine[] = body.lines.map((line: unknown, index) => {
        const item = (typeof line === "object" && line !== null ? line : {}) as Record<string, unknown>
        return { productId: text(item.productId, `lines[${index}].productId`), qty: positiveInt(item.qty, `lines[${index}].qty`) }
    })
    if (new Set(lines.map((line) => line.productId)).size !== lines.length) throw bad("lines")
    return {
        orderId: body.orderId === undefined ? `ord-${randomUUID().slice(0, 8)}` : text(body.orderId, "orderId"),
        customerId: text(body.customerId, "customerId"),
        lines,
        ...(body.voucher === undefined ? {} : { voucher: text(body.voucher, "voucher") }),
    }
}
