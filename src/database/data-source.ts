import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { readFileSync } from 'node:fs';

config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'srv_admin',
  entities: [__dirname + '/entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  ssl:
    process.env.DB_SSL === 'true'
      ? {
          rejectUnauthorized:
            process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
          ...(process.env.DB_SSL_CA_PATH
            ? { ca: readFileSync(process.env.DB_SSL_CA_PATH, 'utf8') }
            : {}),
        }
      : false,
});

export default AppDataSource;
