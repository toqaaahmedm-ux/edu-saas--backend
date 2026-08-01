#!/usr/bin/env node
/**
 * fix-comments-backend.js
 *
 * Replaces the Arabic / mojibake comments flagged by scan-arabic-comments.js
 * (backend run) with natural, human-sounding English comments — line by
 * line, using the exact line numbers from the report. Original indentation
 * is preserved.
 *
 * Usage (run from your backend project root, e.g. EduSaas-backend):
 *   node fix-comments-backend.js --dry-run     -> preview changes, no files touched
 *   node fix-comments-backend.js               -> actually applies the changes
 *
 * IMPORTANT: commit or stash your current work first, so you can review
 * the diff afterwards with `git diff` and revert easily if something looks off.
 *
 * Note: a handful of lines flagged by the scanner (e.g. lines containing a
 * plain em dash "—") are false positives — they were already valid English
 * comments. Those are intentionally left out of the map below.
 */

const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");

// file path -> { lineNumber: "new comment content (without leading indentation)" }
const MAP = {
  "prisma/schema.prisma": {
    69: `// submission state machine: draft → submitted → graded (or returned for revision)`,
  },
  "prisma/seed.ts": {
    278: `// ─── 11. Lessons (with tenantId) ────────────────────────────────`,
  },
  "src/app.module.ts": {
    38: `// SEC-05 FIX: if any critical env var is empty or missing, the app stops booting`,
    39: `// immediately instead of running with the string "undefined" — this scenario used to`,
    40: `// let JWT_SECRET become a fixed, known string that anyone who knew it could sign a valid JWT with.`,
    63: `// collect all the errors at once instead of stopping at the first one —`,
    64: `// easier to fix if more than one variable is missing`,
    104: `// BE-C06 FIX: AuditInterceptor was fully defined, along with the`,
    105: `// @AuditAction decorator that's already used in admin.controller.ts (TENANT_SUSPENDED,`,
    106: `// PLAN_ASSIGNED) — but it was never registered in the pipeline, so not a single audit`,
    107: `// log was actually being written. The interceptor has dependencies`,
    108: `// (PrismaService, Reflector), so it needs to be registered as an APP_INTERCEPTOR provider`,
    109: `// here (not \`new AuditInterceptor()\` in main.ts) so NestJS can inject`,
    110: `// its dependencies correctly.`,
  },
  "src/app.service.ts": {
    21: `// ── NEW-07: real revenue from the DB ──`,
    42: `// ← real, from the DB`,
    43: `// ← count of active students`,
  },
  "src/common/decorators/get-tenant.decorator.ts": {
    3: `// @GetTenant() decorator — pulls the tenantId off the request`,
  },
  "src/common/decorators/require-feature.decorator.ts": {
    5: `// // FeatureGuard — we'll add this later once we resolve the circular dependency`,
  },
  "src/common/filters/http-exception.filter.ts": {
    12: `// ← catches all exceptions, not just HttpException`,
    37: `// if not in production — send the real message for debugging`,
    44: `// log the error on the server`,
  },
  "src/common/guards/session-auth.guard.ts": {
    18: `// delegates to the Passport JWT strategy`,
  },
  "src/common/interceptors/audit.interceptor.ts": {
    11: `// Decorator to specify the action`,
    31: `// if no action is specified — don't log`,
    45: `// for a regular admin: their own tenantId. For SUPER_ADMIN doing createTenant`,
    46: `// on a new tenant, the user itself has no tenantId, so we use the target as the tenantId`,
    47: `// in this case, since it's the same tenant the action was performed on.`,
  },
  "src/common/interceptors/logging.interceptors.ts": {
    20: `// BE-L02: strip query params from the log so PII doesn't get logged`,
  },
  "src/modules/admin/admin.service.spec.ts": {
    12: `// Prisma transaction passes (tx) in the same shape as the prisma client — we mock it the same way`,
    100: `// subdomain isn't a duplicate`,
    101: `// owner email isn't a duplicate`,
    114: `// password was hashed before being stored`,
    117: `// the tenant was created with TRIAL status and a trialEndsAt`,
    129: `// the owner was created with the ADMIN role and linked to the right tenant`,
    141: `// the tenant was updated with ownerUserId after the owner was created`,
  },
  "src/modules/assignments/assignments.module.ts": {
    10: `// so we can use CoursesService for the ownership check + GradesService for automatic recalculation`,
  },
  "src/modules/assignments/assignments.repository.ts": {
    17: `// tenantId directly in the WHERE clause, same logic as the BE-C03 fix in courses`,
    108: `// upsert so the student can edit their submission before the dueDate (resubmit) —`,
    109: `// the unique constraint [assignmentId, studentId] is what prevents duplicate rows`,
  },
  "src/modules/auth/auth.controller.spec.ts": {
    7: `// Note: this file tests AuthController itself (the HTTP layer) —`,
    8: `// not AuthService. AuthService is already covered in auth.service.spec.ts.`,
    9: `// here we're making sure the controller reads the tenant header correctly, sets the`,
    10: `// (access + refresh) cookies correctly, and doesn't return accessToken in the body (BE-H04),`,
    11: `// and that refresh reads the refresh-token from the cookie (BE-C01).`,
    33: `// simple mock for express Response — we only need .cookie(), .clearCookie(), and .json()`,
    97: `// new — the separate refresh-token cookie with a specific path (BE-C01)`,
    105: `// BE-H04 FIX: accessToken used to be sent in the body — exposed to logging`,
    106: `// proxies. Now the body only has success and data, no accessToken at all.`,
    145: `// BE-C01 FIX: refresh now reads the refresh-token from the cookie (instead of`,
    146: `// req.user, which used to come from JwtStrategy after validating the old`,
    147: `// token) — this allows refreshing the access token even if the old access`,
    148: `// token is no longer valid.`,
    187: `// new — must clear the refresh-token cookie too, with the same path`,
  },
  "src/modules/auth/auth.controller.ts": {
    72: `// BE-H04 FIX: we don't return accessToken or refreshToken in the body —`,
    73: `// they're exposed to logging proxies. Both only live in httpOnly cookies.`,
    116: `// BE-L04: GET /auth/me removed from here — the richer route (returns from DB)`,
    117: `// lives in UsersController at GET /me`,
  },
  "src/modules/auth/auth.service.spec.ts": {
    8: `// HIGH-13 FIX: bcryptjs uses an ES Module, so jest.spyOn can't redefine the`,
    9: `// property and throws "Cannot redefine property: compare". The fix is to mock`,
    10: `// the whole module at the file level before any other import.`,
    60: `// new — AuthService now uses ConfigService to read JWT_REFRESH_SECRET`,
    61: `// and JWT_REFRESH_EXPIRES_IN instead of having them hardcoded (BE-C01)`,
    96: `// reset the default values after clearAllMocks`,
    99: `// signToken and signRefreshToken both use sign, just with different secrets,`,
    100: `// so we return two different tokens based on the order they're called in the code:`,
    101: `// signToken (access) is called first, then signRefreshToken (refresh).`,
    161: `// new`,
    180: `// new — signRefreshToken must use JWT_REFRESH_SECRET from ConfigService`,
    181: `// not the main access token secret (BE-C01)`,
    221: `// new`,
    238: `// ── refreshAccessToken (brand new — BE-C01) ───────────────────────────`,
    244: `// this method only calls signToken (no new refresh token),`,
    245: `// so we set the return value explicitly instead of relying on the order`,
    246: `// of mockReturnValueOnce inherited from beforeEach.`,
  },
  "src/modules/auth/strategies/jwt.strategy.ts": {
    7: `// PERF-18 FIX: before this, validate() was running prisma.user.findUnique() on`,
    8: `// every authenticated request — meaning an extra DB query on every API call, even though`,
    9: `// the JWT itself is stateless, signed, and doesn't need verification. At 1000 requests/second`,
    10: `// that's 1000 extra DB queries per second for no benefit.`,
    12: `// The fix: return the payload data directly after passport verifies the signature —`,
    13: `// the payload is trustworthy since it's signed with JWT_SECRET and isn't expired`,
    14: `// (passport checks this automatically because of ignoreExpiration: false).`,
    16: `// Note: if you need to make sure the user still exists in the database (e.g. after`,
    17: `// account deletion), you could add a DB lookup here — but keep in mind this breaks the`,
    18: `// stateless design and adds latency. A better alternative is a token revocation list`,
    19: `// in Redis if this matters for your case.`,
    24: `// reads from the httpOnly cookie first, falls back to the Bearer header if not present`,
    35: `// passport already verified the signature and expiry before reaching here —`,
    36: `// we return the payload directly and it becomes req.user`,
  },
  "src/modules/billing/billing.service.ts": {
    144: `// FIX #22: QUARTERLY isn't supported in Stripe — reject the request instead of silently billing wrong`,
    229: `// FIX #23: update the tenant's status to ACTIVE automatically only after payment —`,
    230: `// not part of assignPlanToTenant, since manually changing the plan from the admin`,
    231: `// shouldn't automatically activate the tenant`,
    266: `// FIX #23: make sure the tenant is ACTIVE on every successful payment`,
  },
  "src/modules/billing/dunning.service.ts": {
    25: `// BE-M04: get the IDs first instead of doing N updates`,
    35: `// BE-M04: updateMany instead of a for loop`,
    41: `// BE-M04: createMany instead of a for loop`,
    61: `// BE-M04: get the IDs first`,
    78: `// BE-M04: updateMany for the subscriptions`,
    84: `// BE-M04: updateMany for the tenants`,
    90: `// BE-M04: createMany for the audit logs`,
  },
  "src/modules/certificates/certificates.controller.spec.ts": {
    15: `// mock the guards directly without needing their dependencies`,
    122: `// BE-C05: findOne now requires a user (from SessionAuthGuard) and passes it`,
    123: `// to the service to verify ownership. The student themselves can view their own certificate.`,
    147: `// BE-C05: if the certificate belongs to a different tenant, the service throws NotFoundException`,
    148: `// (not ForbiddenException) so we don't leak that it exists for another tenant.`,
    155: `// BE-C05: a different student (not the certificate owner) in the same tenant, and not admin/teacher.`,
  },
  "src/modules/certificates/certificates.controller.ts": {
    46: `// PDF-NEW: download the certificate as a real PDF generated server-side via Puppeteer,`,
    47: `// instead of relying on window.print() in the browser. Uses the exact same Guard as`,
    48: `// in findOne, so there's no change in the protection level.`,
    74: `// BE-C05 FIX: this used to be wide open with no Guard at all — anyone (even without`,
    75: `// being logged in) could view another student's personal data just by knowing the UUID. Now it's`,
    76: `// protected by SessionAuthGuard (must be logged in), and we pass tenantId + user`,
    77: `// to the service to verify the certificate belongs to the same tenant and that the requester`,
    78: `// is either the student themselves or ADMIN/TEACHER.`,
  },
  "src/modules/certificates/certificates.repository.ts": {
    41: `// PDF-FIX: score/letterGrade existed in the schema but were never actually being saved.`,
    42: `// added here as optional so any old code calling create() without them keeps working unchanged.`,
  },
  "src/modules/certificates/certificates.service.ts": {
    12: `// FIX #24: one central rule for issuance — quiz passed + course completed`,
    27: `// BE-C05 FIX: before this, findById would return any certificate by id with no`,
    28: `// verification at all — any authenticated user (and even an endpoint exposed with no auth)`,
    29: `// could view another student's personal data (name, email, course name...).`,
    30: `// Now we check two things in order:`,
    31: `//  1. The certificate belongs to the same tenant (tenantId) — if not, throw NotFoundException`,
    32: `//     instead of ForbiddenException, so we don't leak that it exists for another tenant.`,
    33: `//  2. The requester is the student themselves, or ADMIN/TEACHER in the same tenant —`,
    34: `//     otherwise throw ForbiddenException.`,
    55: `// FIX #24: shared helper to check the conditions`,
    63: `// FIX #24: same threshold on both paths`,
    82: `// FIX #24: use the shared helper`,
    113: `// FIX #24: automatic issuance checks progress the same way manual issuance does`,
    122: `// PDF-FIX: used to accept score as a parameter but never actually saved it on`,
    123: `// the certificate — now we actually pass it through so it shows up on the PDF certificate.`,
    150: `// builds the exact same design as Certificate.tsx but as static HTML/CSS`,
    151: `// (no Tailwind) so it renders reliably inside Puppeteer.`,
    187: `// PDF-FIX: older certificates might not have a saved score (null).`,
    188: `// if it exists we show the score and grade, if not we show a generic completion sentence`,
    189: `// instead of showing "undefined%" or breaking the layout.`,
    309: `// fully reuses findById — meaning the exact same protection as`,
    310: `// GET /certificates/:id (tenant check + checking that the requester is the student`,
    311: `// themselves or ADMIN/TEACHER), so there's no new path for unauthorized access.`,
    337: `// very important: we must always close the browser even if an error happens, so we don't leak`,
    338: `// Chromium processes on the server (a real risk on AWS EC2 over time).`,
  },
  "src/modules/courses/courses.controller.spec.ts": {
    41: `// BE-C03: findAll and findOne now take tenantId from req.tenantId`,
    42: `// (set by TenantMiddleware), not from a query param or directly from the user.`,
    43: `// in the unit test, we set a mock request with tenantId manually since`,
    44: `// the middleware itself doesn't run here.`,
    76: `// findAll isn't async — when the tenant context is missing it throws the error directly`,
    77: `// (synchronously) before reaching any return Promise, so we use`,
    78: `// expect(() => ...).toThrow instead of rejects.toThrow.`,
    94: `// findOne also isn't async — same reason as above`,
  },
  "src/modules/courses/courses.controller.ts": {
    237: `// LESSON-PROGRESS-NEW: lets the student save the last stop point in the video, so`,
    238: `// they can resume from there next time. The actual debounce happens on the frontend (not every`,
    239: `// service call), so the only restriction here is that the student must be enrolled in`,
    240: `// this course.`,
  },
  "src/modules/courses/courses.repository.ts": {
    78: `// filter — meaning GET /courses/:id could return a course belonging to`,
    82: `// the current tenant, exactly as if it didn't exist at all — this also`,
    124: `// found) instead of silently updating/deleting it — we don't rely on a`,
    129: `// the Prisma \`data\` payload from that subset — videoUrl was never`,
  },
  "src/modules/courses/courses.service.spec.ts": {
    89: `// BE-C03: if the course does exist but belongs to a different tenant, the repository`,
    90: `// (filtered by tenantId in the WHERE) returns null, so the service throws the same`,
    91: `// NotFoundException — without revealing that the course exists at all for another tenant.`,
    154: `// BE-C04: if the admin sends a tenantId different from the course's tenant, findById`,
    155: `// throws NotFoundException before we even get to the ownership check.`,
  },
  "src/modules/courses/courses.service.ts": {
    349: `// LESSON-PROGRESS-NEW: saves the last stop point in the video for a given student. Does an`,
    350: `// upsert on LessonProgress (unique by studentId+lessonId as in the`,
    351: `// schema), after confirming the student is actually enrolled in this course and that the lesson`,
    352: `// actually belongs to the same course and tenant (prevents tampering with a lesson ID from another course).`,
  },
  "src/modules/enrollments/enrollments.controller.spec.ts": {
    16: `// Note: this is the object the @GetUser() decorator actually returns`,
    17: `// in production. In the unit test there's no NestJS pipeline running`,
    18: `// the decorator, so we set this value manually as mockReq.user when`,
    19: `// calling the controller method directly.`,
  },
  "src/modules/enrollments/enrollments.repository.ts": {
    44: `// Multi-tenant: tenantId is required on create`,
    58: `// BL-04: progress = 100 → COMPLETED automatically`,
  },
  "src/modules/enrollments/enrollments.service.spec.ts": {
    33: `// FEAT-04: mock BillingService — returns null since there's no subscription in the test`,
    38: `// note on CRIT-11: the real code now uses this.prisma.$transaction(async (tx) => {...})`,
    39: `// to fix a race condition on the student count. So $transaction here needs to be a`,
    40: `// function that takes a callback and calls it, passing it "tx" — which is itself an object`,
    41: `// with enrollment.count and enrollment.create, exactly like a normal Prisma client.`,
    90: `// reset defaults after clearAllMocks`,
  },
  "src/modules/modules/modules.module.ts": {
    9: `// so we can use CoursesService for the ownership check`,
  },
  "src/modules/modules/modules.repository.ts": {
    19: `// tenantId directly in the WHERE, not a check afterward — same logic as the BE-C03 fix in courses`,
  },
  "src/modules/notifications/notifications.service.ts": {
    21: `// ── sends to all students of a given tenant ───────────────────────────────`,
    22: `// PERF-19 FIX: before this, we were fetching all of a tenant's users at once`,
    23: `// with findMany() with no limit — with 10,000 students that means 10,000 objects`,
    24: `// in memory + a createMany() with 10,000 rows in a single query, which would`,
    25: `// cause a timeout or a memory crash.`,
    27: `// The fix: fetch users in batches of 500 using`,
    28: `// cursor-based pagination, and run createMany() for each batch separately.`,
    29: `// this keeps memory usage constant no matter how many users there are.`,
    44: `// cursor-based pagination — faster than skip/offset with large datasets`,
    64: `// if the batch is smaller than the limit, we're done`,
  },
  "src/modules/quiz/quiz.controller.spec.ts": {
    68: `// make sure tenantId was sent too (multi-tenant isolation fix)`,
  },
  "src/modules/quiz/quiz.controller.ts": {
    33: `// QUIZ-WINDOW-NEW: optional, comes as an ISO string from the datetime-local`,
    34: `// input on the frontend.`,
  },
  "src/modules/quiz/quiz.service.ts": {
    24: `// QUIZ-WINDOW-NEW: shared type for quiz availability status, used by the frontend to show`,
    25: `// the right badge/countdown.`,
    38: `// QUIZ-WINDOW-NEW: shared helper to compute availability status based on openAt/closeAt`,
    59: `// QUIZ-WINDOW-NEW: add the ready-made availability status to each quiz so the frontend`,
    60: `// can show the right badge without calculating it itself (and it's more accurate since it's`,
    61: `// computed using server time, not the student's device time).`,
    94: `// QUIZ-WINDOW-NEW: prevent starting the quiz before its scheduled time or after it closes. We compute`,
    95: `// using server time, not the student's time, so no one can turn back their clock and open a`,
    96: `// closed quiz.`,
    146: `// QUIZ-WINDOW-NEW: here we allow submitting even if closeAt has passed — because`,
    147: `// the student would have already started the attempt before it closed (that's checked in`,
    148: `// startQuiz), and blocking submission now would mean unfairly losing their answers.`,
    149: `// The real lock is preventing any *new* attempt from starting after closeAt, not blocking`,
    150: `// submission of an attempt that's already in progress.`,
    311: `// QUIZ-WINDOW-NEW: optional — if the teacher left them empty, the quiz`,
    312: `// stays available as before (a non-breaking default behavior).`,
    339: `// QUIZ-WINDOW-NEW: simple logical check — if both are set, the closing time`,
    340: `// must be after the opening time.`,
  },
  "src/modules/upload/upload.controller.ts": {
    34: `// FEAT-05: returns url + hlsUrl + publicId`,
    47: `// FEAT-06: upload documents (PDF, DOCX, PPTX)`,
  },
  "src/modules/users/users.repository.ts": {
    30: `// Multi-tenant: every query filters by tenantId`,
    57: `// Multi-tenant: email unique per tenant — tenantId + email must go together`,
    91: `// Multi-tenant: count users by role within the tenant`,
  },
  "src/modules/users/users.service.ts": {
    57: `// Security fix (a): this endpoint is tenant-scoped and admin-triggered, so it`,
  },
};

let filesChanged = 0;
let linesChanged = 0;
let linesSkipped = 0;

for (const [relPath, lineMap] of Object.entries(MAP)) {
  const fullPath = path.join(process.cwd(), relPath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  SKIP (file not found): ${relPath}`);
    continue;
  }

  const original = fs.readFileSync(fullPath, "utf8");
  const usesCRLF = original.includes("\r\n");
  const lines = original.split(/\r\n|\n/);

  let fileTouched = false;

  for (const [lineNoStr, newContent] of Object.entries(lineMap)) {
    const idx = parseInt(lineNoStr, 10) - 1; // 0-indexed

    if (idx < 0 || idx >= lines.length) {
      console.log(`⚠️  SKIP ${relPath}:${lineNoStr} — line number out of range (file may have changed)`);
      linesSkipped++;
      continue;
    }

    const originalLine = lines[idx];
    const trimmed = originalLine.trim();

    if (trimmed.length === 0) {
      console.log(`⚠️  SKIP ${relPath}:${lineNoStr} — line is empty now (file may have changed), left untouched`);
      linesSkipped++;
      continue;
    }

    const leadingWhitespace = originalLine.match(/^\s*/)[0];
    const newLine = leadingWhitespace + newContent;

    if (newLine === originalLine) {
      continue; // already correct, nothing to do
    }

    if (DRY_RUN) {
      console.log(`\n--- ${relPath}:${lineNoStr} ---`);
      console.log(`- ${originalLine}`);
      console.log(`+ ${newLine}`);
    }

    lines[idx] = newLine;
    fileTouched = true;
    linesChanged++;
  }

  if (fileTouched && !DRY_RUN) {
    const eol = usesCRLF ? "\r\n" : "\n";
    fs.writeFileSync(fullPath, lines.join(eol), "utf8");
    filesChanged++;
  } else if (fileTouched) {
    filesChanged++;
  }
}

console.log("\n──────────────────────────────────────────");
if (DRY_RUN) {
  console.log(`DRY RUN — nothing was written to disk.`);
  console.log(`Would change ${linesChanged} line(s) across ${filesChanged} file(s).`);
  console.log(`Skipped ${linesSkipped} line(s) — review the warnings above.`);
  console.log(`\nRun again without --dry-run to apply the changes.`);
} else {
  console.log(`Done. Changed ${linesChanged} line(s) across ${filesChanged} file(s).`);
  console.log(`Skipped ${linesSkipped} line(s) — review the warnings above.`);
  console.log(`\nRun "git diff" to review, then commit if it looks good.`);
}
