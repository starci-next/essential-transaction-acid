import { Module } from "@nestjs/common"
import { APP_FILTER } from "@nestjs/core"
import { CheckoutApiModule } from "../../features/api/checkout/checkout-api.module"
import { LabApiModule } from "../../features/api/lab/lab-api.module"
import { SHOP_ERROR_KINDS } from "../../modules/domain/shop"
import { DatabaseModule } from "../../platform/database"
import { ErrorsFilter } from "../../platform/errors"

@Module({
    imports: [DatabaseModule, CheckoutApiModule, LabApiModule],
    providers: [{ provide: APP_FILTER, useFactory: () => new ErrorsFilter(new Map(Object.entries(SHOP_ERROR_KINDS))) }],
})
/** The shop api: the checkout door, the read doors and the test hooks, over one database. */
export class AppModule {}
