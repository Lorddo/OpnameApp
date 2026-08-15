-- photos.uploaded_at: null until R2 content PUT succeeds
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz;

-- Staging backfill: treat existing meta rows as already uploaded so they do not
-- permanently block inspection.completed webhooks.
UPDATE public.photos
SET uploaded_at = created_at
WHERE uploaded_at IS NULL;

CREATE INDEX IF NOT EXISTS photos_pending_upload_idx
  ON public.photos (source_inspection_id)
  WHERE uploaded_at IS NULL;

-- webhook delivery status enum + table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'webhook_delivery_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.webhook_delivery_status AS ENUM (
      'pending',
      'sending',
      'delivered',
      'failed'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  inspection_id uuid NOT NULL REFERENCES public.inspections (id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties (id),
  dedupe_key text NOT NULL,
  payload jsonb NOT NULL,
  status public.webhook_delivery_status NOT NULL DEFAULT 'pending',
  attempt_count int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_status_code int,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (event_type, inspection_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_inspection_id_idx
  ON public.webhook_deliveries (inspection_id);

CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx
  ON public.webhook_deliveries (next_attempt_at)
  WHERE status IN ('pending', 'sending');

DROP TRIGGER IF EXISTS webhook_deliveries_set_updated_at ON public.webhook_deliveries;
CREATE TRIGGER webhook_deliveries_set_updated_at
  BEFORE UPDATE ON public.webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries FORCE ROW LEVEL SECURITY;

-- No policies: service_role only (Worker uses service client).
REVOKE ALL ON TABLE public.webhook_deliveries FROM anon, authenticated;
GRANT ALL ON TABLE public.webhook_deliveries TO service_role;

CREATE OR REPLACE FUNCTION app_private.claim_webhook_deliveries(p_limit int DEFAULT 20)
RETURNS SETOF public.webhook_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.webhook_deliveries AS d
  SET
    status = 'sending'::public.webhook_delivery_status,
    updated_at = timezone('utc', now())
  WHERE d.id IN (
    SELECT id
    FROM public.webhook_deliveries
    WHERE status IN (
      'pending'::public.webhook_delivery_status,
      'sending'::public.webhook_delivery_status
    )
      AND next_attempt_at <= timezone('utc', now())
    ORDER BY next_attempt_at
    LIMIT greatest(1, least(coalesce(p_limit, 20), 100))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING d.*;
END;
$$;

REVOKE ALL ON FUNCTION app_private.claim_webhook_deliveries(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.claim_webhook_deliveries(int) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_webhook_deliveries(p_limit int DEFAULT 20)
RETURNS SETOF public.webhook_deliveries
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT * FROM app_private.claim_webhook_deliveries(p_limit);
$$;

REVOKE ALL ON FUNCTION public.claim_webhook_deliveries(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_webhook_deliveries(int) TO service_role;
