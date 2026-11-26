/** How a refusal travels: `refused` is the customer's to fix (422), `not-found` names something that is not there (404). */
export type ErrorKind = "invalid" | "not-found" | "refused"

export interface DomainErrorInit<C extends string> {
    code: C
    /** Values the client may read beside the code, such as the product that ran out. */
    params?: Readonly<Record<string, string>>
    cause?: unknown
}

/** The one base of every coded error: a stable code, optional params, the caught cause. Its message is the code. */
export class DomainError<C extends string = string> extends Error {
    readonly code: C
    readonly params: Readonly<Record<string, string>>

    constructor(init: DomainErrorInit<C>) {
        super(init.code, { cause: init.cause })
        this.code = init.code
        this.params = init.params ?? {}
    }
}
