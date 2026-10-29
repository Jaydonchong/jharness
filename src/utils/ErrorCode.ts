export enum ErrorCode {
    /** @deprecated Use MODEL_RESPONSE_VALIDATION_ERROR. */
    AI_MODEL_UNEXPECTED_MISSING_RESPONSE = "AI_MODEL_UNEXPECTED_MISSING_RESPONSE",
    MAX_AGENT_LOOP_ITERATION_REACHED = "MAX_AGENT_LOOP_ITERATION_REACHED",

    SERVER_ERROR = "SERVER_ERROR", // catch all
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED",
    VALIDATION_ERROR = "VALIDATION_ERROR",
    NETWORK_ERROR = "NETWORK_ERROR", // Error with network
    AI_PROVIDER_RESPONSE_ERROR = "AI_PROVIDER_RESPONSE_ERROR", // Error with generating response
    AI_PROVIDER_CONFIGURATION_ERROR = "AI_PROVIDER_CONFIGURATION_ERROR", // Invalid model, prompt etc
    AI_PROVIDER_REQUEST_ERROR = "AI_PROVIDER_REQUEST_ERROR", // Validation Error on Provider side
    AI_TOOL_CALL_ERROR = "AI_TOOL_CALL_ERROR",
    AGENT_LOOP_TIMEOUT = "AGENT_LOOP_TIMEOUT",
    MODEL_RESPONSE_VALIDATION_ERROR = "MODEL_RESPONSE_VALIDATION_ERROR", // Unexpected successful response

    COMPACTION_SETUP_ERROR = "COMPACTION_SETUP_ERROR",
    COMPACTION_RUN_ERROR = "COMPACTION_RUN_ERROR",
}

export class DomainError extends Error {
    readonly cause?: unknown;

    constructor(
        public readonly code: ErrorCode,
        message: string,
        cause?: unknown,
    ) {
        super(message);
        this.name = "DomainError";
        this.cause = cause;
    }
}

export const asDomainError = (
    error: unknown,
    code: ErrorCode,
    message: string,
): DomainError =>
    error instanceof DomainError
        ? error
        : new DomainError(code, message, error);
