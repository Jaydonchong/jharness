import pino from 'pino';

export type ILoggerOptions = {
	name: string;
	level?: string;
	tags: string[];
};

export class Logger {
	private readonly pino: pino.Logger;

	constructor(private readonly options?: ILoggerOptions) {
		this.pino = pino(
			{
				name: this.options?.name ?? 'default',
				level: this.options?.level ?? 'info',
			},
			pino.destination({
				dest: 1,
				sync: true,
			}),
		);
	}

	private log(
		level: 'fatal' | 'info' | 'debug' | 'warn' | 'error',
		message: string,
		object: Record<string, any>,
	) {
		const severity = level.toUpperCase();
		const timestamp = new Date().toISOString();
		const body = JSON.stringify({ ...object, message });

		this.pino[level]({ timestamp, severity }, body);
	}

	public fatal(message: string = '', object: Record<string, any> = {}) {
		this.log('fatal', message, object);
	}
	public info(message: string = '', object: Record<string, any> = {}) {
		this.log('info', message, object);
	}
	public debug(message: string = '', object: Record<string, any> = {}) {
		this.log('debug', message, object);
	}
	public warn(message: string = '', object: Record<string, any> = {}) {
		this.log('warn', message, object);
	}
	public error(message: string = '', object: Record<string, any> = {}) {
		this.log('error', message, object);
	}
}

const logger = new Logger();
export default logger;
