import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common"
import { CheckoutService, type OrderView, type PlacedOrder, ShopReadService, type StockView, type WalletView } from "../../../modules/domain/shop"
import { checkoutInputOf } from "./checkout.input"

@Controller()
/** The shop's HTTP door: thin handlers that parse the request and call the domain services. */
export class CheckoutController {
    constructor(
        private readonly checkoutService: CheckoutService,
        private readonly reads: ShopReadService,
    ) {}

    @Post("checkout")
    @HttpCode(201)
    checkout(@Body() body: unknown): Promise<PlacedOrder> {
        return this.checkoutService.checkout(checkoutInputOf(body))
    }

    @Get("orders/:id")
    order(@Param("id") id: string): Promise<OrderView> {
        return this.reads.order(id)
    }

    @Get("wallets/:customerId")
    wallet(@Param("customerId") customerId: string): Promise<WalletView> {
        return this.reads.wallet(customerId)
    }

    @Get("stock/:productId")
    stock(@Param("productId") productId: string): Promise<StockView> {
        return this.reads.stock(productId)
    }
}
