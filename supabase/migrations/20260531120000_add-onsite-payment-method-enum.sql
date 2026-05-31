-- Add ONSITE to the payment method enum so Pay On-Site (현장 결제) registrations
-- can create payment records (status PENDING until paid on-site).
ALTER TYPE public.eckcm_payment_method ADD VALUE IF NOT EXISTS 'ONSITE';
