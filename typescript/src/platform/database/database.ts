import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common"
import { Pool, type PoolClient, type QueryResultRow } from "pg"
import { env, sleep } from "../env"
import { FaultsService, stepOf } from "../faults/faults.service"

/** The name the shop's connections carry in `pg_stat_activity`; the test hooks find the shop's connections by it. */
export const APP_NAME = "shop"

/** What FAIL_AT runs instead of the write: a real Postgres error (SQLSTATE 58030, an I/O error) on the same connection. */
const FAULT_SQL = "DO $$ BEGIN RAISE EXCEPTION 'simulated I/O error: the write was not stored' USING ERRCODE = '58030'; END $$"

/** Savepoint names are SQL identifiers, so they are checked before they are written into a statement. */
const SAVEPOINT_NAME = /^[a-z][a-z0-9_]{0,30}$/

/**
 * One open transaction on one dedicated connection. Every statement of a use case goes through the same `Tx`, so they commit
 * together or not at all. Domain code receives a `Tx` from `Database.transaction` and never opens or closes one itself.
 */
export class Tx {
    constructor(
        private readonly client: PoolClient,
        private readonly faults: FaultsService,
    ) {}

    async query<R extends QueryResultRow = QueryResultRow>(text: string, values: ReadonlyArray<unknown> = []): Promise<R[]> {
        const step = stepOf(text)
        if (this.faults.failsAt(step)) await this.client.query(FAULT_SQL)
        const result = await this.client.query<R>(text, [...values])
        if (step !== null && this.faults.crashesAt(step)) this.faults.crash(step)
        return result.rows
    }

    /**
     * Runs `work` behind a savepoint inside this transaction. If `work` throws, only its writes are undone (`ROLLBACK TO
     * SAVEPOINT`) and the error is rethrown; the outer transaction stays usable, which a plain try/catch cannot give, since
     * Postgres refuses every statement of a transaction after one of them failed.
     */
    async savepoint<T>(name: string, work: () => Promise<T>): Promise<T> {
        if (!SAVEPOINT_NAME.test(name)) throw new Error(`invalid savepoint name ${name}`)
        await this.client.query(`SAVEPOINT ${name}`)
        try {
            const result = await work()
            await this.client.query(`RELEASE SAVEPOINT ${name}`)
            return result
        } catch (error) {
            await this.client.query(`ROLLBACK TO SAVEPOINT ${name}`)
            throw error
        }
    }
}

@Injectable()
/** The shop's Postgres database: a few reusable connections and the one way to open a transaction on them. */
export class Database implements OnModuleInit, OnApplicationShutdown {
    private readonly logger = new Logger(Database.name)
    private pool = this.open()

    constructor(private readonly faults: FaultsService) {}

    /** Postgres may still be starting when the shop boots: wait for it instead of failing the boot. */
    async onModuleInit(): Promise<void> {
        for (let attempt = 1; ; attempt++) {
            try {
                await this.pool.query("SELECT 1")
                return
            } catch (error) {
                if (attempt >= 60) throw error
                this.logger.warn(`database not reachable yet (${String(error)}), waiting`)
                await sleep(500)
            }
        }
    }

    async onApplicationShutdown(): Promise<void> {
        await this.pool.end()
    }

    /** One read outside any transaction. */
    async query<R extends QueryResultRow = QueryResultRow>(text: string, values: ReadonlyArray<unknown> = []): Promise<R[]> {
        return (await this.pool.query<R>(text, [...values])).rows
    }

    /**
     * Runs `work` in one transaction on one dedicated connection: `COMMIT` when it returns, `ROLLBACK` when it throws. The
     * connection goes back only after the transaction ended either way, so the next request never inherits a half-open block.
     * If even the `ROLLBACK` fails, the connection is destroyed instead of being handed back.
     */
    async transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
        const client = await this.pool.connect()
        let broken: Error | undefined
        try {
            await client.query("BEGIN")
            const result = await work(new Tx(client, this.faults))
            await client.query("COMMIT")
            return result
        } catch (error) {
            await client.query("ROLLBACK").catch((rollbackError: unknown) => {
                broken = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError))
            })
            throw error
        } finally {
            client.release(broken)
        }
    }

    /** Test hooks only: closes every connection of the shop (Postgres drops whatever they left open) and opens fresh ones. */
    async reopen(): Promise<void> {
        const old = this.pool
        await this.withOwnConnection((client) =>
            client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND application_name = $1", [
                APP_NAME,
            ]),
        )
        this.pool = this.open()
        old.end().catch(() => undefined)
    }

    /** A connection outside the shop's own ones, for the test hooks: it still works when the shop's connections are stuck. */
    async withOwnConnection<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
        const pool = new Pool({ connectionString: env("DATABASE_URL"), max: 1, application_name: "shop-hooks" })
        const client = await pool.connect()
        try {
            return await work(client)
        } finally {
            client.release()
            await pool.end()
        }
    }

    private open(): Pool {
        const pool = new Pool({ connectionString: env("DATABASE_URL"), max: 10, application_name: APP_NAME })
        pool.on("error", (error) => this.logger.warn(`an idle connection was closed: ${error.message}`))
        return pool
    }
}
