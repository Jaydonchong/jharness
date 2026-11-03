import { DomainError, ErrorCode } from '../utils/ErrorCode';

export enum SessionStatus {
	START = 'START',
	INITIALIZING = 'INITIALIZING',
	WAITING = 'WAITING',
	REASONING = 'REASONING',
	TOOL = 'TOOL',
	COMPACTING = 'COMPACTING',
	INTERRUPTED = 'INTERRUPTED',
	END = 'END',
}

export type InterruptionDetails = {
	userMessage: string;
	partialReply: string;
	errorMessage: string;
	occurredAt: number;
};

type SessionStateValue =
	| { status: SessionStatus.INTERRUPTED; details: InterruptionDetails }
	| { status: Exclude<SessionStatus, SessionStatus.INTERRUPTED> };

export type SessionStateTransitionEvent = {
	from: SessionStatus;
	to: SessionStatus;
};

export type SessionStateEventListener = (event: SessionStateTransitionEvent) => void;

const SESSION_STATE_TRANSITION_REGISTRY: Record<SessionStatus, SessionStatus[]> = {
	[SessionStatus.START]: [SessionStatus.INITIALIZING, SessionStatus.END],
	[SessionStatus.INITIALIZING]: [SessionStatus.START, SessionStatus.WAITING],
	[SessionStatus.WAITING]: [SessionStatus.REASONING, SessionStatus.COMPACTING, SessionStatus.END],
	[SessionStatus.REASONING]: [
		SessionStatus.TOOL,
		SessionStatus.WAITING,
		SessionStatus.INTERRUPTED,
		SessionStatus.END,
	],
	[SessionStatus.TOOL]: [SessionStatus.REASONING, SessionStatus.INTERRUPTED, SessionStatus.END],
	[SessionStatus.COMPACTING]: [SessionStatus.WAITING, SessionStatus.END],
	[SessionStatus.INTERRUPTED]: [SessionStatus.REASONING, SessionStatus.END],
	[SessionStatus.END]: [],
};

export class SessionState {
	private state: SessionStateValue = { status: SessionStatus.START };

	constructor(private readonly onTransition: SessionStateEventListener) {}

	public get currentState(): SessionStatus {
		return this.state.status;
	}

	public get interruptedStreamAttempt(): Readonly<InterruptionDetails> | null {
		return this.state.status === SessionStatus.INTERRUPTED ? this.state.details : null;
	}

	public transitionTo(nextState: SessionStatus): void {
		if (nextState === SessionStatus.INTERRUPTED) {
			throw new DomainError(
				ErrorCode.VALIDATION_ERROR,
				'Use interrupt() to transition to INTERRUPTED',
			);
		}

		this.transitionToValue({ status: nextState });
	}

	public interrupt(details: InterruptionDetails): void {
		if (
			this.currentState !== SessionStatus.REASONING &&
			this.currentState !== SessionStatus.TOOL
		) {
			return;
		}

		this.transitionToValue({ status: SessionStatus.INTERRUPTED, details: details });
	}

	private transitionToValue(nextState: SessionStateValue): void {
		const previousState = this.currentState;
		const nextStatus = nextState.status;
		if (previousState === nextStatus) {
			if (nextStatus === SessionStatus.COMPACTING) {
				throw new DomainError(
					ErrorCode.VALIDATION_ERROR,
					`Invalid session state transition: ${previousState} -> ${nextStatus}`,
				);
			}
			return;
		}
		if (!SESSION_STATE_TRANSITION_REGISTRY[previousState].includes(nextStatus)) {
			throw new DomainError(
				ErrorCode.VALIDATION_ERROR,
				`Invalid session state transition: ${previousState} -> ${nextStatus}`,
			);
		}

		this.state = nextState;
		this.onTransition({ from: previousState, to: nextStatus });
	}
}
