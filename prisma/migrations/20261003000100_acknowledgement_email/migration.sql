-- Operator amendment (John, 2026-10-03): acknowledgement email sent when a
-- ticket is created, replacing the allocation email.
ALTER TYPE "message_type" ADD VALUE 'ACKNOWLEDGEMENT';
