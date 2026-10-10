-- The demo phone login gets a password a founder can type in front of a buyer.
--
-- 0222 gave demo.telecaller@callproai.in a long random password. It works, but
-- nobody can type it from memory during a demo. This replaces it with a short
-- one. The plaintext is NOT in this repo (the repo is public); the founder has
-- it in chat. Only its bcrypt hash is here, the same $2a$10$ format 0222 used,
-- and the same format crypt(pw, gen_salt('bf', 10)) produces.
--
-- SCOPE. Exactly one row of auth.users can change: the demo telecaller, matched
-- by its fixed id AND its email AND a profile sitting in the demo company
-- (is_demo = true). A real user cannot match all three. Nothing else is touched.
--
-- Re-running 0222 would put the old password back. Run this again after it.
-- Safe to run twice.
--
-- Not applied by this commit. The founder applies it by hand.
-- applied by hand on <date>

begin;

update auth.users u
   set encrypted_password = '$2a$10$gV3XBxgV24pZSa4st6GGze6sPMoAI.bS0FC7J4x8uyc0vCYEK1r9q',
       updated_at = now()
 where u.id = 'de000000-0000-4000-8000-0000000000a1'
   and u.email = 'demo.telecaller@callproai.in'
   and exists (
         select 1
           from public.profiles p
           join public.companies c on c.id = p.company_id
          where p.id = u.id
            and p.company_id = 'de000000-0000-4000-8000-000000000001'
            and c.is_demo is true
       );

-- Check: 1 row means the demo login now uses the new password.
select count(*) as demo_logins_updated
  from auth.users
 where id = 'de000000-0000-4000-8000-0000000000a1'
   and encrypted_password = '$2a$10$gV3XBxgV24pZSa4st6GGze6sPMoAI.bS0FC7J4x8uyc0vCYEK1r9q';

commit;
