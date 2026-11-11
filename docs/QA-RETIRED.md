# QA database disconnected

At the owner's request, Visual QA is retired. Do not apply migrations, seeds, media operations or verification runs to `rgcevrvxfunmwephhomy`.

- Local `.env.qa.local` credentials and the QA environment template were removed.
- QA npm commands were removed; retained historical seed/verification scripts fail before creating any database client.
- The QA Next runner is disabled. Next configuration rejects the retired URL or QA environment overrides rather than silently falling back to production.
- No QA server was running when disconnected. Earlier QA reproduction commands in historical documents are obsolete. Scripts and evidence remain for reference only.
- Production configuration/data are unchanged. The owner will delete the hosted QA project separately; disconnecting does not revoke remote keys or delete the project.

Never repoint the fictional-data QA scripts at production. Normal development/build uses the existing production configuration, without a QA switch.
