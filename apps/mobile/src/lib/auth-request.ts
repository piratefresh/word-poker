const RESET_PASSWORD_PATH = /^\/api\/auth\/reset-password\/[^/]+\/?$/;
const CALLBACK_QUERY_PREFIX = "callbackURL=";

/**
 * Some mail-client redirectors can preserve one encoding layer around the
 * complete callbackURL pair. URLSearchParams then sees that pair as a
 * parameter name with no value, so Better Auth reports a missing callback.
 *
 * Repair only that observed shape on Better Auth's GET reset endpoint. Better
 * Auth still validates the recovered callback against trustedOrigins.
 */
export function normalizePasswordResetRequest(request: Request): Request {
  if (request.method !== "GET") {
    return request;
  }

  const url = new URL(request.url);

  if (
    !RESET_PASSWORD_PATH.test(url.pathname) ||
    url.searchParams.has("callbackURL")
  ) {
    return request;
  }

  const malformedKey = [...url.searchParams.keys()].find((key) =>
    key.startsWith(CALLBACK_QUERY_PREFIX),
  );

  if (!malformedKey || url.searchParams.get(malformedKey) !== "") {
    return request;
  }

  const encodedCallback = malformedKey.slice(CALLBACK_QUERY_PREFIX.length);

  if (!encodedCallback) {
    return request;
  }

  let callbackURL: string;

  try {
    callbackURL = decodeURIComponent(encodedCallback);
  } catch {
    return request;
  }

  url.searchParams.delete(malformedKey);
  url.searchParams.set("callbackURL", callbackURL);

  return new Request(url, request);
}
