import { DatabaseError } from "pg"

/** The Postgres error codes the shop reads: the ones a write gets when it breaks a rule of a table. */
export const PgCode = {
    CheckViolation: "23514",
    UniqueViolation: "23505",
    ForeignKeyViolation: "23503",
    NotNullViolation: "23502",
} as const

/** The rule a refused write broke: the constraint's name and its table, or null when the error is not a rule refusal. */
export interface BrokenRule {
    code: string
    constraint: string
    table: string
    /** The values of the refused row, in the table's column order (Postgres puts them in `detail`). */
    row: ReadonlyArray<string>
}

export const brokenRuleOf = (error: unknown): BrokenRule | null => {
    if (!(error instanceof DatabaseError) || error.code === undefined || !error.code.startsWith("23")) return null
    const values = /\((.*)\)/.exec(error.detail ?? "")?.[1]
    return {
        code: error.code,
        constraint: error.constraint ?? "",
        table: error.table ?? "",
        row: values === undefined ? [] : values.split(",").map((value) => value.trim()),
    }
}
