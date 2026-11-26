import { Injectable, Logger } from "@nestjs/common"
import { env } from "../env"

/**
 * Fault switches for the end-to-end specs, reachable only when the process runs with `TEST_HOOKS=on` (docker-compose.yml sets
 * it; a production deployment does not). They act in the database layer, never in the checkout: the checkout must hold its
 * promises without knowing a fault is simulated.
 *
 * A checkout writes five places, called steps: `order` (orders), `items` (order_items), `voucher` (voucher_redemptions),
 * `wallet` (wallets), `stock` (stock). The database layer tells the step of a write from the table it writes.
 *
 *   FAIL_AT   "<step>"  the first write of that step fails with a real Postgres error that breaks no rule (an I/O error)
 *   CRASH_AT  "<step>"  the first write of that step runs, then the process exits at once, like a power cut
 *
 * The switches live in the memory of one process, so a restart clears them: CRASH_AT kills the process exactly once.
 */
export const STEPS = ["order", "items", "voucher", "wallet", "stock"] as const
export type Step = (typeof STEPS)[number]

const isStep = (value: unknown): value is Step => (STEPS as ReadonlyArray<unknown>).includes(value)

/** The step a SQL statement writes, or null for a read or a transaction statement. */
export const stepOf = (text: string): Step | null => {
    const sql = text.replace(/\s+/g, " ").trim().toUpperCase()
    if (/^INSERT INTO ORDERS\b/.test(sql)) return "order"
    if (/^INSERT INTO ORDER_ITEMS\b/.test(sql)) return "items"
    if (/^INSERT INTO VOUCHER_REDEMPTIONS\b/.test(sql)) return "voucher"
    if (/^UPDATE WALLETS\b/.test(sql)) return "wallet"
    if (/^UPDATE STOCK\b/.test(sql)) return "stock"
    return null
}

export interface FaultState {
    FAIL_AT?: Step
    CRASH_AT?: Step
}

@Injectable()
export class FaultsService {
    private readonly logger = new Logger("faults")
    readonly enabled = env("TEST_HOOKS", "off") === "on"
    private state: FaultState = {}

    get(): FaultState {
        return { ...this.state }
    }

    /** Sets FAIL_AT and CRASH_AT; any other value ("off", null) clears the switch. Other keys are not faults and are ignored here. */
    set(patch: Readonly<Record<string, unknown>>): FaultState {
        for (const key of ["FAIL_AT", "CRASH_AT"] as const) {
            if (!(key in patch)) continue
            const value = patch[key]
            if (isStep(value)) this.state[key] = value
            else delete this.state[key]
        }
        return this.get()
    }

    reset(): void {
        this.state = {}
    }

    failsAt(step: Step | null): boolean {
        return this.enabled && step !== null && this.state.FAIL_AT === step
    }

    crashesAt(step: Step | null): boolean {
        return this.enabled && step !== null && this.state.CRASH_AT === step
    }

    /** Dies without cleaning up, like a power cut; docker compose (`restart: always`) brings the process back. */
    crash(step: Step): never {
        this.logger.error(`CRASH_AT=${step}: exiting right after the ${step} write`)
        process.exit(1)
    }
}
