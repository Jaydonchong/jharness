import { getMeter } from '../telemetry/Telemetry';

export abstract class AbstractService {
	public abstract run(): Promise<void>;

	protected constructor(protected readonly name: string) {}

	protected getMeter() {
		return getMeter(`service.${this.name}`);
	}
}
