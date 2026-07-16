-- Phase N: BANT/ICP becomes a soft warning instead of a hard DB-level block
-- on moving a lead into a "won" (Qualified) stage (Group 4 / E2). Safe as a
-- single statement — no enum/type changes here.
--
-- The fields themselves (ICP Match, Budget, Authority) stay fully visible
-- and encouraged in the UI (LeadQualificationCard, unlock messaging), and
-- the frontend now shows a dismissible "BANT/ICP not completed — continue
-- anyway?" confirmation before letting the move through — but the database
-- no longer raises an exception if the rep proceeds anyway.
--
-- Convert-to-Deal itself is untouched by this patch: guard_deal_creation()
-- still requires the lead's stage to already be Qualified before a deal can
-- be created, so Convert-to-Deal remains the only deal-creation path.

create or replace function guard_lead_qualification() returns trigger as $$
begin
  return new;
end;
$$ language plpgsql;
