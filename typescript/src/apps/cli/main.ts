import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { Client } from "pg"
import { seedIfEmpty } from "../../modules/domain/shop"
import { env, sleep } from "../../platform/env"

/**
 * The ops cli, the only process that changes the schema or loads data:
 *   migrate   applies every db/migrations/*.sql not applied yet, in name order, each in its own transaction
 *   seed      loads the sample data into an empty database
 * docker-compose.yml runs both before the shop starts.
 */
const MIGRATIONS = join(__dirname, "..", "..", "..", "db", "migrations")

const connect = async (): Promise<Client> => {
    for (let attempt = 1; ; attempt++) {
        const client = new Client({ connectionString: env("DATABASE_URL"), application_name: "shop-cli" })
        try {
            await client.connect()
            return client
        } catch (error) {
            await client.end().catch(() => undefined)
            if (attempt >= 60) throw error
            await sleep(500)
        }
    }
}

const migrate = async (client: Client): Promise<void> => {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())")
    const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations")
    const applied = new Set(rows.map((row) => row.name))
    for (const name of readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort()) {
        if (applied.has(name)) continue
        // A migration and its record commit together: a failed migration leaves neither, and runs again next time.
        await client.query("BEGIN")
        try {
            await client.query(readFileSync(join(MIGRATIONS, name), "utf8"))
            await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name])
            await client.query("COMMIT")
            console.log(`applied ${name}`)
        } catch (error) {
            await client.query("ROLLBACK")
            throw error
        }
    }
}

const main = async (): Promise<void> => {
    const command = process.argv[2]
    const client = await connect()
    try {
        if (command === "migrate") await migrate(client)
        else if (command === "seed") console.log((await seedIfEmpty(client)) ? "sample data loaded" : "database already holds data")
        else throw new Error(`unknown command ${String(command)}: use migrate | seed`)
    } finally {
        await client.end()
    }
}

main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
})
