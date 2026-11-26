import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from "@nestjs/common"
import type { Response } from "express"
import { DomainError, type ErrorKind } from "./domain.error"

const STATUS: Record<ErrorKind, number> = { invalid: 400, "not-found": 404, refused: 422 }

@Catch()
/**
 * The one answer to every failure. A `DomainError` answers `{ error: <code>, ...params }` with its kind's status; Nest's own
 * HTTP errors (a malformed JSON body) keep their status; anything else is masked to `500 { error: "INTERNAL" }` and logged,
 * so a client never sees SQL or a stack.
 */
export class ErrorsFilter implements ExceptionFilter {
    private readonly logger = new Logger("errors")

    constructor(private readonly kinds: ReadonlyMap<string, ErrorKind>) {}

    catch(error: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>()
        if (error instanceof DomainError) {
            const kind = this.kinds.get(error.code) ?? "invalid"
            response.status(STATUS[kind]).json({ error: error.code, ...error.params })
            return
        }
        if (error instanceof HttpException) {
            response.status(error.getStatus()).json({ error: "BAD_REQUEST", message: error.message })
            return
        }
        this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
        response.status(500).json({ error: "INTERNAL" })
    }
}
