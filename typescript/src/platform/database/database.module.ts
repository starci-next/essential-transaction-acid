import { Global, Module } from "@nestjs/common"
import { FaultsService } from "../faults/faults.service"
import { Database } from "./database"

@Global()
@Module({ providers: [Database, FaultsService], exports: [Database, FaultsService] })
/** One Database (one set of connections) for the whole process, and the fault switches its transactions read. */
export class DatabaseModule {}
