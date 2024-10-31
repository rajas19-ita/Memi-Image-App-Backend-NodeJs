import { integer, pgTable, primaryKey, varchar } from "drizzle-orm/pg-core";
import { Image } from "./image.js";

export const Tag = pgTable("tag", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    tagName: varchar("tag_name", { length: 25 }).notNull().unique(),
});

export const ImageTags = pgTable(
    "image_tags",
    {
        imageId: integer("image_id")
            .notNull()
            .references(() => Image.id),
        tagId: integer("tag_id")
            .notNull()
            .references(() => Tag.id),
    },
    (table) => {
        return {
            pk: primaryKey({ columns: [table.imageId, table.tagId] }),
        };
    }
);
