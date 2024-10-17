import "dotenv/config";
import { drizzle } from "drizzle-orm/connect";

const db = await drizzle("node-postgres", process.env.DATABASE_URL);

export { db };
