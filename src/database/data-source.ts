import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
	type: 'postgres',
	host: process.env.POSTGRES_HOST,
	port: process.env.POSTGRES_PORT ? Number(process.env.POSTGRES_PORT) : undefined,
	username: process.env.POSTGRES_USER,
	password: process.env.POSTGRES_PASSWORD,
	database: process.env.POSTGRES_DB,
	extensions: ['vector'],
	entities: [__dirname + '/../**/*.entity{.js,.ts}'],
	migrations: [__dirname + '/../migrations/*{.js,.ts}'],
	synchronize: false,
});
