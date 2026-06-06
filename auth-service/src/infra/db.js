import pkg from "pg";
import { config } from "../config.js";

const { Pool } = pkg;

export const pool = new Pool({
  host: config.dbHost,
  port: config.dbPort,
  database: config.dbName,
  user: config.dbUser,
  password: config.dbPassword,
});