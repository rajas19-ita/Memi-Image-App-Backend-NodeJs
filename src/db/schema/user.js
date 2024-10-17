import { integer, pgTable, varchar } from "drizzle-orm/pg-core";

export const User = pgTable("users", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    username: varchar({ length: 30 }).notNull().unique(),
    password: varchar({ length: 255 }).notNull(),
});
