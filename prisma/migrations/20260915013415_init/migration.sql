-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'HR_LEAD', 'HR_OFFICER');

-- CreateEnum
CREATE TYPE "priority" AS ENUM ('P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('NEW', 'ALLOCATED', 'IN_ACTION', 'OUTCOME', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "close_reason" AS ENUM ('RESOLVED', 'NOT_A_REQUEST', 'REDIRECTED');

-- CreateEnum
CREATE TYPE "message_direction" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "message_type" AS ENUM ('ORIGINAL', 'REPLY', 'ALLOCATION', 'OUTCOME', 'MANUAL');

-- CreateEnum
CREATE TYPE "note_visibility" AS ENUM ('INTERNAL', 'REQUESTER_VISIBLE');

-- CreateEnum
CREATE TYPE "attachment_source" AS ENUM ('EMAIL', 'UPLOAD');

-- CreateEnum
CREATE TYPE "scan_status" AS ENUM ('PENDING', 'CLEAN', 'MALICIOUS', 'BLOCKED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "access_basis" AS ENUM ('ASSIGNEE', 'ACL_GRANTED', 'HR_LEAD', 'ADMIN');

-- CreateEnum
CREATE TYPE "suppression_type" AS ENUM ('SENDER', 'DOMAIN', 'SUBJECT_PATTERN');

-- CreateEnum
CREATE TYPE "email_log_status" AS ENUM ('SENT', 'FAILED', 'RETRYING');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_units" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "entra_object_id" TEXT NOT NULL,
    "upn" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "ticket_no" VARCHAR(12) NOT NULL,
    "original_subject" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "requester_email" CITEXT NOT NULL,
    "requester_name" TEXT NOT NULL,
    "cc_recipients" TEXT[],
    "received_at" TIMESTAMP(3) NOT NULL,
    "request_date" DATE NOT NULL,
    "category_id" UUID,
    "business_unit_id" UUID,
    "priority" "priority" NOT NULL,
    "sla_due_at" TIMESTAMP(3) NOT NULL,
    "target_due_at" TIMESTAMP(3),
    "target_due_reason" TEXT,
    "status" "ticket_status" NOT NULL DEFAULT 'NEW',
    "assigned_to" UUID,
    "assigned_at" TIMESTAMP(3),
    "first_viewed_at" TIMESTAMP(3),
    "first_viewed_by" UUID,
    "escalation_count" INTEGER NOT NULL DEFAULT 0,
    "last_escalated_at" TIMESTAMP(3),
    "is_confidential" BOOLEAN NOT NULL DEFAULT false,
    "confidential_set_by" UUID,
    "confidential_set_at" TIMESTAMP(3),
    "is_legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "legal_hold_reason" TEXT,
    "legal_hold_set_by" UUID,
    "legal_hold_set_at" TIMESTAMP(3),
    "legal_hold_cleared_by" UUID,
    "legal_hold_cleared_at" TIMESTAMP(3),
    "outcome_for_requester" TEXT,
    "outcome_sent_at" TIMESTAMP(3),
    "close_reason" "close_reason",
    "closed_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "retention_purge_date" DATE NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "delete_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "direction" "message_direction" NOT NULL,
    "message_type" "message_type" NOT NULL,
    "graph_message_id" TEXT,
    "internet_message_id" TEXT,
    "conversation_id" TEXT,
    "from_address" TEXT NOT NULL,
    "from_name" TEXT,
    "to_recipients" TEXT[],
    "cc_recipients" TEXT[],
    "subject" TEXT NOT NULL,
    "body_text" TEXT,
    "body_html" TEXT,
    "sent_by" UUID,
    "received_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "correlation_id" UUID NOT NULL,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_notes" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" "note_visibility" NOT NULL DEFAULT 'INTERNAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "supersedes_note_id" UUID,

    CONSTRAINT "ticket_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_attachments" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "message_id" UUID,
    "filename" TEXT NOT NULL,
    "declared_content_type" TEXT,
    "detected_content_type" TEXT,
    "size_bytes" INTEGER NOT NULL,
    "blob_path" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "source" "attachment_source" NOT NULL,
    "scan_status" "scan_status" NOT NULL DEFAULT 'PENDING',
    "block_reason" TEXT,
    "uploaded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_status_history" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "from_status" "ticket_status",
    "to_status" "ticket_status" NOT NULL,
    "from_assignee" UUID,
    "to_assignee" UUID,
    "actor_id" UUID NOT NULL,
    "reason" TEXT,
    "correlation_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_access" (
    "ticket_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "granted_by" UUID NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_access_pkey" PRIMARY KEY ("ticket_id","user_id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "ticket_id" UUID,
    "actor_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "access_basis" "access_basis",
    "reason" TEXT,
    "correlation_id" UUID NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_log" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "graph_response_code" INTEGER,
    "status" "email_log_status" NOT NULL,
    "error" TEXT,
    "correlation_id" UUID NOT NULL,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_rules" (
    "id" UUID NOT NULL,
    "type" "suppression_type" NOT NULL,
    "value" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "suppression_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_log" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "from_address" TEXT NOT NULL,
    "subject" TEXT,
    "internet_message_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "correlation_id" UUID NOT NULL,

    CONSTRAINT "suppression_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_subscriptions" (
    "id" UUID NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "client_state" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" UUID NOT NULL,
    "job_name" TEXT NOT NULL,
    "correlation_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "items_processed" INTEGER,
    "error" TEXT,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "business_units_name_key" ON "business_units"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_entra_object_id_key" ON "users"("entra_object_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticket_no_key" ON "tickets"("ticket_no");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "tickets_assigned_to_idx" ON "tickets"("assigned_to");

-- CreateIndex
CREATE INDEX "tickets_request_date_idx" ON "tickets"("request_date");

-- CreateIndex
CREATE INDEX "tickets_retention_purge_date_idx" ON "tickets"("retention_purge_date");

-- CreateIndex
CREATE INDEX "tickets_requester_email_idx" ON "tickets"("requester_email");

-- CreateIndex
CREATE INDEX "tickets_is_confidential_idx" ON "tickets"("is_confidential");

-- CreateIndex
CREATE INDEX "tickets_is_legal_hold_idx" ON "tickets"("is_legal_hold");

-- CreateIndex
CREATE INDEX "tickets_category_id_idx" ON "tickets"("category_id");

-- CreateIndex
CREATE INDEX "tickets_business_unit_id_idx" ON "tickets"("business_unit_id");

-- CreateIndex
CREATE INDEX "tickets_sla_due_at_idx" ON "tickets"("sla_due_at");

-- CreateIndex
CREATE INDEX "tickets_target_due_at_idx" ON "tickets"("target_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_messages_graph_message_id_key" ON "ticket_messages"("graph_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_messages_internet_message_id_key" ON "ticket_messages"("internet_message_id");

-- CreateIndex
CREATE INDEX "ticket_messages_ticket_id_idx" ON "ticket_messages"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_messages_conversation_id_idx" ON "ticket_messages"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_notes_supersedes_note_id_key" ON "ticket_notes"("supersedes_note_id");

-- CreateIndex
CREATE INDEX "ticket_notes_ticket_id_idx" ON "ticket_notes"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_attachments_ticket_id_idx" ON "ticket_attachments"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_status_history_ticket_id_idx" ON "ticket_status_history"("ticket_id");

-- CreateIndex
CREATE INDEX "audit_log_correlation_id_idx" ON "audit_log"("correlation_id");

-- CreateIndex
CREATE INDEX "audit_log_ticket_id_idx" ON "audit_log"("ticket_id");

-- CreateIndex
CREATE INDEX "email_log_ticket_id_idx" ON "email_log"("ticket_id");

-- CreateIndex
CREATE INDEX "job_runs_job_name_idx" ON "job_runs"("job_name");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_units" ADD CONSTRAINT "business_units_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_first_viewed_by_fkey" FOREIGN KEY ("first_viewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_confidential_set_by_fkey" FOREIGN KEY ("confidential_set_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_legal_hold_set_by_fkey" FOREIGN KEY ("legal_hold_set_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_legal_hold_cleared_by_fkey" FOREIGN KEY ("legal_hold_cleared_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_notes" ADD CONSTRAINT "ticket_notes_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_notes" ADD CONSTRAINT "ticket_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_notes" ADD CONSTRAINT "ticket_notes_supersedes_note_id_fkey" FOREIGN KEY ("supersedes_note_id") REFERENCES "ticket_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ticket_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_access" ADD CONSTRAINT "ticket_access_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_access" ADD CONSTRAINT "ticket_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_access" ADD CONSTRAINT "ticket_access_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ticket_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppression_rules" ADD CONSTRAINT "suppression_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppression_log" ADD CONSTRAINT "suppression_log_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "suppression_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
