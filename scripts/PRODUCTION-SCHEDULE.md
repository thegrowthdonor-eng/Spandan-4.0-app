# Official schedule import

Run `production-schedule.sql` in the SQL Editor of the **original** Supabase project `uytvtmkapusjjqhjyopd`.
Do not run this against the Visual QA project. The transaction checks the original edition ID before creating or inserting anything.

The file creates `schedule_entries` with public read access to published rows and service-role write access, then inserts 84 programme entries transcribed from pages 2–7 of the supplied brochure. It corrects the festival date range to 3–8 December 2026. It does not change registration windows, edition publication state, event registrations, fixtures or existing event venues.

| December date | Programme entries |
| --- | ---: |
| 3 | 16 |
| 4 | 16 |
| 5 | 17 |
| 6 | 13 |
| 7 | 14 |
| 8 | 8 |

Exact clock times and individual venues are not in the brochure. Times remain NULL. The shared venue is `College Campus, ASMC Firozabad`. The spelling `Piti`, the combined `Pushups & skipping` and `Faculty fashion show/Dance` entries, repeated Poetry/Pictionary sessions, and both prize distributions are preserved. The final highlighted `ASMC got talent` on page 3 is included in Cultural. Bonfire night and Night 5/6 are grouped as After hours without invented start times.

This is a programme, not a registration catalogue: sports divisions, team pairings and competitions with similar titles are not automatically equated. Match fixtures remain independently visible in the schedule.

The import is transactional and repeat-run safe: existing source keys are retained, including any timings subsequently added by organisers. After running it, verify:

```sql
select day, count(*) from public.schedule_entries
where edition_id = '463de563-fc0a-41d0-8038-1e2f0558ce55'
group by day order by day;
```

Deploy the updated app code and refresh `/schedule` on the production environment. The running `dev:qa` app continues to read QA data; it will not display the original database's brochure programme. No UI deployment or database import is performed by merely preparing these files.

The schedule opens on six homepage-style day cards. Activating a card opens that day's programme; All days returns to the card grid and restores keyboard focus. Previous/next controls navigate the programme. Filters and search operate on the selected day and reset when changing days.
