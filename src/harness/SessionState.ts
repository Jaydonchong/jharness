import { DomainError, ErrorCode } from "../utils/ErrorCode";

export enum SessionStatus {
    START = "START",
    INITIALIZING = "INITIALIZING",
    WAITING = "WAITING",
    REASONING = "REASONING",
    TOOL = "TOOL",
    COMPACTING = "COMPACTING",
    END = "END",
}

export type SessionStateTransitionEvent = {
    from: SessionStatus;
    to: SessionStatus;
};

export type SessionStateEventListener = (
    event: SessionStateTransitionEvent,
) => void;

const SESSION_STATE_TRANSITION_REGISTRY: Record<
    SessionStatus,
    SessionStatus[]
> = {
    [SessionStatus.START]: [SessionStatus.INITIALIZING, SessionStatus.END],
    [SessionStatus.INITIALIZING]: [
        SessionStatus.START,
        SessionStatus.WAITING,
    ],
    [SessionStatus.WAITING]: [
        SessionStatus.REASONING,
        SessionStatus.COMPACTING,
        SessionStatus.END,
    ],
    [SessionStatus.REASONING]: [
        SessionStatus.TOOL,
        SessionStatus.WAITING,
        SessionStatus.END,
    ],
    [SessionStatus.TOOL]: [SessionStatus.REASONING, SessionStatus.END],
    [SessionStatus.COMPACTING]: [SessionStatus.WAITING, SessionStatus.END],
    [SessionStatus.END]: [],
};

export class SessionState {
    private state = SessionStatus.START;

    constructor(private readonly onTransition: SessionStateEventListener) {}

    public get currentState(): SessionStatus {
        return this.state;
    }

    public transitionTo(nextState: SessionStatus): void {
        const previousState = this.state;
        if (previousState === nextState) {
            if (nextState === SessionStatus.COMPACTING) {
                throw new DomainError(
                    ErrorCode.VALIDATION_ERROR,
                    `Invalid session state transition: ${previousState} -> ${nextState}`,
                );
            }
            return;
        }
        if (!SESSION_STATE_TRANSITION_REGISTRY[previousState].includes(nextState)) {
            throw new DomainError(
                ErrorCode.VALIDATION_ERROR,
                `Invalid session state transition: ${previousState} -> ${nextState}`,
            );
        }

        this.state = nextState;
        this.onTransition({ from: previousState, to: nextState });
    }
}
