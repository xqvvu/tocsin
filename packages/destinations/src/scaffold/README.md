# Scaffold template

`scripts/new-destination-adapter.mjs <kind>` copies these files into
`packages/destinations/src/<kind>/` and rewrites the placeholder token family
(`generic-webhook`, `generic_webhook`, `genericWebhook`, `GenericWebhook`,
`GENERIC_WEBHOOK`, plus the `generic webhook` prose in the sample error
messages) to the new kind.

They are real adapter files, not string templates: `vp check` typechecks them
and `index.test.ts` exercises the adapter through `@tocsin/destinations/test-kit`,
so the scaffold (and the contributor guide that quotes these files verbatim)
cannot drift from code that actually compiles and runs. `kind` stays
`generic_webhook` only because the repository's `DestinationKind` enum is closed
and a template has to point at some real kind to typecheck.

See `docs/contributing/destination-adapter.md` for the full contribution path.
