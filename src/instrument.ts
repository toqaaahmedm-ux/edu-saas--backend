import * as Sentry from '@sentry/nestjs';

// This file must be imported before anything else in main.ts — Sentry
// needs to patch Node's internals (http, etc.) before the rest of the
// app boots, otherwise it can miss errors from modules that were
// already loaded.
//
// SENTRY_DSN is optional on purpose: if it's not set (e.g. someone's
// running the app locally without a Sentry account yet), Sentry.init
// simply no-ops instead of crashing the server. That's why this isn't
// in the Joi validationSchema in app.module.ts as a required var.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Keep tracing volume low by default — this can be tuned up once
    // there's a real production traffic pattern to calibrate against.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}