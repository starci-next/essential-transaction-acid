import { DomainError, type ErrorKind } from "../../../../platform/errors"

/**
 * Codes of the shop capability. The values are the shop's public HTTP contract (the lab's tests match on them), so they keep
 * their short form.
 */
export enum ShopErrorCode {
    /** A line asks for more pairs than the stock holds. Params: `productId`. */
    OutOfStock = "OUT_OF_STOCK",
    /** The wallet holds less than the order total. */
    InsufficientFunds = "INSUFFICIENT_FUNDS",
    /** The request body is not a checkout. Params: `field`. */
    BadField = "BAD_FIELD",
    OrderNotFound = "ORDER_NOT_FOUND",
    WalletNotFound = "WALLET_NOT_FOUND",
    ProductNotFound = "PRODUCT_NOT_FOUND",
}

/** How each shop code travels. */
export const SHOP_ERROR_KINDS: Record<ShopErrorCode, ErrorKind> = {
    [ShopErrorCode.OutOfStock]: "refused",
    [ShopErrorCode.InsufficientFunds]: "refused",
    [ShopErrorCode.BadField]: "invalid",
    [ShopErrorCode.OrderNotFound]: "not-found",
    [ShopErrorCode.WalletNotFound]: "not-found",
    [ShopErrorCode.ProductNotFound]: "not-found",
}

/** The one error class of the shop capability. */
export class ShopError extends DomainError<ShopErrorCode> {}
