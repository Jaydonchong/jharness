import { getMeter, getTracer } from '../telemetry/Telemetry';

export abstract class AbstractService {
	protected readonly tracer: ReturnType<typeof getTracer>;

	public abstract run(): Promise<void>;

	protected constructor(protected readonly name: string) {
		this.tracer = getTracer(`service.${this.name}`);
	}

	protected getMeter() {
		return getMeter(`service.${this.name}`);
	}
}
