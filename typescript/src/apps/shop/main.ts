import "reflect-metadata"
import { Logger } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { env } from "../../platform/env"
import { AppModule } from "./app.module"

/** The serving process. It never migrates or seeds: `npm run migrate` and `npm run seed` (the cli) do, before it starts. */
const main = async (): Promise<void> => {
    const app = await NestFactory.create(AppModule, { bodyParser: true })
    app.enableShutdownHooks()
    const port = Number(env("PORT", "4310"))
    await app.listen(port)
    new Logger("shop").log(`listening on ${port}`)
}

main().catch((error: unknown) => {
    console.error("shop failed to start:", error)
    process.exit(1)
})
