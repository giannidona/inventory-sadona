-- The Mercado Envíos QR actually decodes to a small JSON blob, not a plain
-- code:
--   {"id":"47678049887","sender_id":419582725,"hash_code":"...","security_digit":"0"}
-- "id" is the envío/shipment number (matches the "Envío" field on the
-- label), NOT the "Pack ID" printed above it. This migration renames
-- pack_id -> envio_id and adds columns for the rest of the decoded fields,
-- backfilling from rows scanned before this change (which stored the raw
-- JSON blob directly in pack_id/raw_qr).

alter table shipments rename column pack_id to envio_id;
alter index shipments_pack_id_idx rename to shipments_envio_id_idx;

alter table shipments add column if not exists sender_id text;
alter table shipments add column if not exists hash_code text;
alter table shipments add column if not exists security_digit text;

update shipments
set
  sender_id = coalesce(sender_id, raw_qr::jsonb ->> 'sender_id'),
  hash_code = coalesce(hash_code, raw_qr::jsonb ->> 'hash_code'),
  security_digit = coalesce(security_digit, raw_qr::jsonb ->> 'security_digit'),
  envio_id = coalesce(raw_qr::jsonb ->> 'id', envio_id)
where raw_qr is not null and raw_qr like '{%';
