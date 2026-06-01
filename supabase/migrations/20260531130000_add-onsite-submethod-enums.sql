-- Add on-site sub-method payment types so admins can record how an on-site
-- payment was actually made (cash / check / Zelle). These are all manual
-- (non-card) methods: no Stripe processing fee, discount-eligible, and the
-- payment status / method can be changed manually by an admin.
ALTER TYPE public.eckcm_payment_method ADD VALUE IF NOT EXISTS 'ONSITE_CASH';
ALTER TYPE public.eckcm_payment_method ADD VALUE IF NOT EXISTS 'ONSITE_CHECK';
ALTER TYPE public.eckcm_payment_method ADD VALUE IF NOT EXISTS 'ONSITE_ZELLE';
