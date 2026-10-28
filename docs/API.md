# API contract

Base: `/api`, JSON unless a file upload/download or CSV export. Web uses the HTTP-only same-origin session cookie. Android uses `Authorization: Bearer <opaque token>`. Mutations accept `Idempotency-Key: <8–100 character operation ID>`; replay returns the saved result, and reuse with changed content returns 409. Generic record edits/decisions require the current integer `version`.

Error envelope: `{ "error": { "code": "VERSION_CONFLICT", "message": "..." } }`. 400 invalid fields, 401 expired/invalid session, 403 permission/origin denial, 404 missing/inaccessible record, 409 locked/conflicting/duplicate business operation. Transient 5xx/429 and network failures remain queued on Android; business validation errors are shown for correction.

| Method/path                                                               | Behavior                                                                                                              |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| POST `/auth/login`                                                        | companyCode, email, password, client=`web` or `android`; Android gets token                                           |
| GET `/auth/me`                                                            | Current user                                                                                                          |
| POST `/auth/logout`                                                       | Revoke current session                                                                                                |
| POST `/auth/password`                                                     | Verify currentPassword, set newPassword, revoke all sessions                                                          |
| POST `/auth/access-help`                                                  | Public, rate limited. Stores an access-reset request for the administrator; reply never reveals if the account exists |
| GET `/bootstrap`                                                          | Authorized catalog, people, master/activity records, policies and stock                                               |
| GET `/catalog`                                                            | Shared module field schemas and report types                                                                          |
| GET/POST `/users`; PUT `/users/:id`                                       | Employee access/hierarchy; admin writes; password reset forces change                                                 |
| GET/POST `/records/:kind`                                                 | Filtered authorized list / validated create (`{data,ownerId?}`)                                                       |
| GET/PUT/DELETE `/record/:id`                                              | Detail, optimistic edit (`{data,version}`), audited soft removal                                                      |
| POST `/record/:id/submit`                                                 | Submit own draft/returned approvable record (`{version}`)                                                             |
| POST `/record/:id/decision`                                               | Manager/admin approve, return or reject (`{version,action,reason}`)                                                   |
| POST `/record/:id/acknowledge`                                            | Recipient acknowledges challan (`{version,receivedQty,notes}`)                                                        |
| POST `/visits`                                                            | Validate assigned customer/day plan/GPS, consume stock and calculate POB transactionally                              |
| POST `/dcr`                                                               | Prepare daily report (`{date,remarks}`); submit locks field activity                                                  |
| GET `/approvals`                                                          | Pending decisions within the manager’s hierarchy, excluding own                                                       |
| GET `/inventory`                                                          | Authorized employee/item balances                                                                                     |
| GET `/dashboard`                                                          | Live aggregates; date/from/to/ownerId filters                                                                         |
| GET `/tracking`; GET `/tracking/:userId`                                  | Fleet status / observed points, gaps, events, distance; date filter                                                   |
| GET `/shifts/active`                                                      | Current user’s active shift                                                                                           |
| POST `/shifts/start`                                                      | `{deviceId,startedAt?}`; one active shift; start requires day plan                                                    |
| POST `/shifts/:id/end`                                                    | `{endedAt?}`; observed end cannot precede uploaded points                                                             |
| POST `/shifts/:id/points`                                                 | `{points:[...]}`; up to 500, unique IDs, observed timestamps, coordinates, accuracy, battery, mock flag               |
| POST `/shifts/:id/events`                                                 | Explicit device event and observed time                                                                               |
| GET `/reports/:type`                                                      | productivity/deviations/missed-coverage/product-reach/expenses/pob/sales/inventory/audit; `format=csv` downloads      |
| GET/PUT `/policies`                                                       | Configurable company rules; admin writes                                                                              |
| GET `/integrations`                                                       | Current unconfigured external service states                                                                          |
| POST `/attachments`                                                       | Multipart one PDF/JPEG/PNG, max 10 MB, signature validation                                                           |
| GET `/attachments/:id`                                                    | Authorized attachment download                                                                                        |
| POST `/import/customers`                                                  | Atomic `{rows:[...]}` CSV-derived import with row validation                                                          |
| GET `/support`                                                            | Help topics, administrator contact and the caller's own requests                                                      |
| GET/POST `/support/tickets`; PUT `/support/tickets/:id`                   | Raise a request (category sync/location/access/report/other); admins list all, set status and reply                   |
| GET `/access`                                                             | Per-module read/write capability for the signed-in role, with the reason when restricted                              |
| GET/PUT `/preferences`                                                    | Language preference (`en` or `hi`); also returned by `/bootstrap`                                                     |
| GET/POST `/customers/:id/addresses`; PUT/DELETE `/customer-addresses/:id` | Extra customer addresses (max 10) beside the clinic and residence address; versioned                                  |
| GET `/campaigns/:id/doctors`                                              | Participating customers with calls, last visit and coverage inside the campaign dates                                 |
| GET `/dcr/pending`                                                        | Dates with calls but no submitted daily report, with deadline and days left                                           |
| GET `/exports`, `/exports/:key`                                           | Export catalog with row counts; CSV download, audited                                                                 |
| GET `/orders`, `/orders/:id`                                              | POB orders and order detail                                                                                           |
| GET `/exceptions`; POST `/visits/:id/review`                              | Location exceptions and manager accept/flag review                                                                    |
| GET `/visits/:id/evidence`                                                | GPS checks, customer location and nearby trail for a call                                                             |
| GET `/analytics/:type`                                                    | Summary, chart series and rows for the four visual reports                                                            |
| GET `/users/:id/profile`                                                  | Employee profile with KPIs, calls, customers, tracking and requests                                                   |

Kinds and exact required fields are defined in `packages/shared/src/index.ts` and returned by `/catalog`. Query filters: q, ownerId, status, type, date, from and to. Users see only their company; representatives see their own activity and assigned customers; managers see their recursive reporting hierarchy. Shared master data stays within the company.

Visit request: customerId, planId, visitedAt (ISO instant), outcome, remarks, optional campaignId, location `{latitude,longitude,accuracy,observedAt,mocked}` or null, exceptionReason, detailedProductIds, samples/inputs `{itemId,quantity}[]`, orderLines `{itemId,quantity}[]`. Order prices and totals come from the server. Missing/stale/mock/inaccurate/out-of-radius location requires an explanation and remains unverified. Each stock operation and visit commits or rolls back together.

All business dates use Asia/Kolkata; instants use UTC ISO strings. Tracking freshness is calculated from observation time, never upload time. Gaps are not assigned a reason unless an actual device event supports it. Recorded distance excludes gaps and low-quality/mock fixes; it is not a certified travel allowance measurement.
