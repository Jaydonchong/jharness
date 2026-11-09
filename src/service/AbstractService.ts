import { getMeter, getTracer } from '../telemetry/Telemetry';

export abstract class AbstractService {
	public abstract run(): Promise<void>;

	protected getTracer(scope: string) {
		return getTracer(`service.${scope}`);
	}

	protected getMeter(scope: string) {
		return getMeter(`service.${scope}`);
	}
}
