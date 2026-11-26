import { Module } from "@nestjs/common"
import { DatabaseModule } from "../../../platform/database"
import { CheckoutService } from "./checkout.service"
import { ShopReadService } from "./shop-read.service"

@Module({
    imports: [DatabaseModule],
    providers: [CheckoutService, ShopReadService],
    exports: [CheckoutService, ShopReadService],
})
export class ShopModule {}
