-- CreateTable
CREATE TABLE "reservation_holds" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "table_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "party_size" INTEGER NOT NULL,
    "session_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservation_holds_venue_id_date_idx" ON "reservation_holds"("venue_id", "date");

-- CreateIndex
CREATE INDEX "reservation_holds_table_id_date_idx" ON "reservation_holds"("table_id", "date");

-- CreateIndex
CREATE INDEX "reservation_holds_expires_at_idx" ON "reservation_holds"("expires_at");

-- CreateIndex
CREATE INDEX "reservation_holds_session_id_idx" ON "reservation_holds"("session_id");

-- AddForeignKey
ALTER TABLE "reservation_holds" ADD CONSTRAINT "reservation_holds_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_holds" ADD CONSTRAINT "reservation_holds_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
