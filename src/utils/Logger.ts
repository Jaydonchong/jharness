import pino from "pino";

export type ILoggerOptions = {
    name: string;
    level?: string;
    tags: string[];
};

export class Logger {
    private readonly pino: pino.Logger;

    constructor(private readonly options?: ILoggerOptions) {
        this.pino = pino({
            name: this.options?.name ?? "default",
            level: this.options?.level ?? "info",
        });
    }

    public fatal(message: string = "", object: Record<string, any> = {}) {
        this.pino.fatal(object, message);
    }
    public info(message: string = "", object: Record<string, any> = {}) {
        this.pino.info(object, message);
    }
    public debug(message: string = "", object: Record<string, any> = {}) {
        this.pino.debug(object, message);
    }
    public warn(message: string = "", object: Record<string, any> = {}) {
        this.pino.warn(object, message);
    }
    public error(message: string = "", object: Record<string, any> = {}) {
        this.pino.error(object, message);
    }
}

const logger = new Logger();
export default logger;
