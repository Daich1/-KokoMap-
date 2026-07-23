-- Plan tab enhancements: per-spot planned time
ALTER TABLE places ADD COLUMN IF NOT EXISTS plan_time text;
