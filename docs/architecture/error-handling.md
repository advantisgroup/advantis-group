# Error-handling pipeline

Every failure has one of two outcomes: it is shown to the user with safe,
localised copy, and it is logged with diagnostic context, or both.

## Server

`apps/api` uses `ApiError` for expected failures. Route code raises a stable
code and an HTTP status; provider detail is retained only for the server log.
The root Elysia error handler runs every failure through `reportApiFailure`,
an Effect pipeline that normalizes the error, logs the request id, method,
path, status, code, and diagnostic detail, then returns the public envelope:

```ts
{ error: string, code: string, requestId: string }
```

Unexpected errors always become `internal` with generic public copy. Do not
return upstream responses, stack traces, configuration, or provider messages
to a browser.

The shared `@advantis/api-contract` package owns the public error envelope
and its stable codes. Provider clients throw `ProviderError`, adding provider,
operation, retryability, and an upstream request id to the server log without
exposing any of that diagnostic data to the browser.

## Convex

Convex functions continue to throw `ConvexError({ code, message })`. The code
is the contract for clients; message text is diagnostic fallback, not UI copy.
Public functions must authorize first and use a stable code for expected
failures.

## Intranet

`parseError` understands both Convex errors and Elysia/Eden response bodies.
`useErrorHandler` and every error boundary pass errors to `reportClientError`,
which logs the original error and selects localised copy from `Errors.json`.
`ClientErrorReporter` covers browser errors and unhandled rejections outside
React boundaries.

`ApiResponseError` retains an API error code and request id for fetch/XHR
paths. `useApiQuery` reports read failures to the shared error pipeline and
keeps error state separate from valid empty data. Safe error metadata is also
captured as the `intranet_error` PostHog event.

Never render `error.message` or a provider response directly. Add a stable
code plus an English and German `Errors` message when a user needs a distinct
recovery instruction.
