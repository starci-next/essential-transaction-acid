import { randomUUID } from "node:crypto"
import { Body, Controller, Get, HttpCode, NotFoundException, Post, Put } from "@nestjs/common"
import { applySeeds, reseed } from "../../../modules/domain/shop"
import { APP_NAME, Database } from "../../../platform/database"
import { type FaultState, FaultsService } from "../../../platform/faults"

/** A new id per process start: the specs read it to know the process really restarted after CRASH_AT. */
export const BOOT_ID = randomUUID()

@Controller()
/**
 * Health for docker, and the test hooks the end-to-end specs drive. The hooks answer only under `TEST_HOOKS=on`; the paths are
 * the lab's (`/lab/chaos`, `/lab/reset`, `/lab/unfinished-blocks`), so the same specs run against the lab and this reference.
 */
export class LabController {
    constructor(
        private readonly database: Database,
        private readonly faults: FaultsService,
    ) {}

    @Get("health")
    health(): { ok: true; service: string; bootId: string } {
        return { ok: true, service: APP_NAME, bootId: BOOT_ID }
    }

    @Put("lab/chaos")
    async chaos(@Body() patch: Record<string, unknown>): Promise<FaultState> {
        this.requireHooks()
        const state = this.faults.set(patch)
        await this.database.withOwnConnection((client) => applySeeds(client, patch))
        return state
    }

    /** Clears the switches, closes every connection of the shop and opens fresh ones, and puts the sample data back. */
    @Post("lab/reset")
    @HttpCode(200)
    async reset(): Promise<{ ok: true }> {
        this.requireHooks()
        this.faults.reset()
        await this.database.reopen()
        await this.database.withOwnConnection(reseed)
        return { ok: true }
    }

    /** Transaction blocks a shop connection opened and left open: the connection is idle but still inside the block. */
    @Get("lab/unfinished-blocks")
    async unfinishedBlocks(): Promise<unknown[]> {
        this.requireHooks()
        return this.database.withOwnConnection(async (client) => {
            const result = await client.query(
                "SELECT pid, state, left(query, 200) AS last_statement FROM pg_stat_activity WHERE datname = current_database() AND application_name = $1 AND state LIKE 'idle in transaction%' ORDER BY pid",
                [APP_NAME],
            )
            return result.rows
        })
    }

    private requireHooks(): void {
        if (!this.faults.enabled) throw new NotFoundException()
    }
}
