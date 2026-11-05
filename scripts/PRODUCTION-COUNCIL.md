# Production council setup

This directory deliberately keeps real council data out of the QA seed.

1. In the original Supabase project's SQL Editor, run `supabase/migrations/20261104120000_council_directory.sql`.
2. In the same original project, run `scripts/production-council.sql`.
3. Verify `select public.get_public_council_directory();` returns three leadership records and eight empty committees.

Student members are added later with one row in `council_people` per student using the verified MBBS 2023 batch ID and roll number. A student can then receive several rows in `council_assignments`, one for each committee. Registration automatically links the roster identity to `profiles.id`, but the registered name becomes public only after the access record is active. The public function never returns roll number, phone, gender, or other private profile data.
