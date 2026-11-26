import { Module } from "@nestjs/common"
import { ShopModule } from "../../../modules/domain/shop"
import { CheckoutController } from "./checkout.controller"

@Module({ imports: [ShopModule], controllers: [CheckoutController] })
export class CheckoutApiModule {}
