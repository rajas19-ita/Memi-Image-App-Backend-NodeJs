ALTER TABLE "image" ALTER COLUMN "upload_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "image" ALTER COLUMN "upload_at" SET DEFAULT now();