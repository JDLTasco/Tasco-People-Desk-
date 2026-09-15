-- CreateTable
CREATE TABLE "graph_delta_state" (
    "id" UUID NOT NULL,
    "delta_link" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "graph_delta_state_pkey" PRIMARY KEY ("id")
);
