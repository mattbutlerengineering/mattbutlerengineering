-- Additive enum value: marks a closure made by the Pause dialog (availability hub A0.2b, #8687),
-- so only those pauses widen the shell pill and banner and offer Resume.
-- Non-destructive: ALTER TYPE ... ADD VALUE only appends; no rows are touched.
ALTER TYPE "DateRuleSource" ADD VALUE IF NOT EXISTS 'pause';
