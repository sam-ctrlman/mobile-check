# mobile-check — status

Where work stopped and what's next. Update at the end of every session. Cite board IDs
(`~/tools/docs/BOARD.md`); never copy board rows here.

<!-- created by /memlayout 2026-10-30 -->

## Now
- Working on: TOOL-MOVE-E — tool moved into the tools workspace (`~/tools/projects/mobile-check`), project docs added.
- Stopped at: stage 0 docs.

## Next
- see `~/tools/docs/BOARD.md` rows `TOOL-MOBC-*`

## Blocked / waiting
- none

## Skipped / bypassed
- 2026-11-06 · TOOL-GH5 steps D+F · history rewrite (exception to the no-rewrite rule, asked by user, D5=b) · private names replaced before GitHub publish · ⚖ HIGH · old main bbba235 → new 8aa92ee; git01 force-pushed; backup ~/tools/backups/mobile-check-pre-rewrite-2026-11-06-153308.bundle; other clones: reset to git01/main · accepted by user
- 2026-11-07 · TOOL-AUTHOR-SCRUB steps B–H · history rewrite (exception to the no-rewrite rule, asked by user, D1=a) · author/committer → the public noreply identity, all commits re-signed (D6=c) · ⚖ HIGH · old main 8aa92ee → new 46798b1; backup server force-pushed with lease; GitHub repo deleted + recreated (D5=b); backup ~/backup/repo-sync/tools-mobile-check-pre-scrub-20261107-140819.bundle; other clones: fetch the backup remote and reset main to it · accepted by user
- 2026-11-07 · TOOL-AUTHOR-SCRUB step D · skip · GitHub profile name → the account name (user keeps the profile name; it is a pseudonym) · ⚖ MEDIUM · risk: any edit/merge made on github.com is authored with the profile name again (public), and the pre-push hook then refuses the next backup-server push until rewritten — make every change locally · accepted by user
- 2026-11-07 · TOOL-AUTHOR-SCRUB step J · stopped at J after 2 tries · commit of this file refused twice by the private-word check (the account name was in the two lines above; reworded, D13 = a)
