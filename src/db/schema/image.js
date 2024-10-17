import { integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { User } from "./user.js";

export const Image = pgTable("image", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    key: varchar({ length: 255 }).notNull().unique(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    fileSize: integer("file_size").notNull(),
    userId: integer("user_id")
        .notNull()
        .references(() => User.id),
    uploadAt: timestamp("upload_at", {
        precision: 3,
        withTimezone: true,
    }).defaultNow(),
});
