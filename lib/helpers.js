import {
  ACCOUNT_EMAIL,
  ACCOUNT_ID,
  API_HOST,
  API_PAGE_SIZE,
  API_TOKEN,
  MAX_RETRIES,
  REQUEST_TIMEOUT_MS,
} from "./constants.js";
import { sleep } from "./utils.js";

/**
 * Fires a request to the specified URL, retrying on rate limits (429) and
 * transient server errors (5xx) with exponential backoff.
 * @param {string} url The URL to which the request will be fired.
 * @param {RequestInit} options The options to be passed to `fetch`.
 * @param {number} [attempt=1] The current attempt number, starting at 1.
 * @returns {Promise<any>}
 */
const request = async (url, options, attempt = 1) => {
  if (!API_TOKEN || !ACCOUNT_ID || !ACCOUNT_EMAIL) {
    throw new Error(
      "One or more required secrets have not been added: CLOUDFLARE_API_KEY, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_ACCOUNT_EMAIL"
    );
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
      "X-Auth-Email": ACCOUNT_EMAIL,
      "X-Auth-Key": API_TOKEN,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...options,
  });

  const isRateLimited = response.status === 429;
  const isServerError = response.status >= 500;

  if ((isRateLimited || isServerError) && attempt <= MAX_RETRIES) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const delaySeconds = retryAfter > 0 ? retryAfter : 2 ** attempt;

    console.warn(
      `Cloudflare API returned ${response.status} - retrying in ${delaySeconds}s (attempt ${attempt}/${MAX_RETRIES})`
    );
    await sleep(delaySeconds * 1000);

    return request(url, options, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const data = await response.json();

  console.log(`HTTP request succeeded: ${data.success}`);

  return data;
};

/**
 * Fires request to the Zero Trust gateway.
 * @param {string} path The path which will be appended to the request URL.
 * @param {RequestInit} options The options to be passed to `fetch`.
 * @returns {Promise<any>}
 */
export const requestGateway = (path, options) =>
  request(`${API_HOST}/accounts/${ACCOUNT_ID}/gateway${path}`, options);

/**
 * Fetches every page of a paginated Gateway GET endpoint and returns the
 * combined `result` array. Cloudflare's list endpoints page their results
 * (e.g. 25-50 per page by default), which matters here since accounts can
 * end up with hundreds of "CFGSL List" entries.
 * @param {string} path The path which will be appended to the request URL.
 * @returns {Promise<any[]>}
 */
export const requestGatewayAllPages = async (path) => {
  const results = [];
  const separator = path.includes("?") ? "&" : "?";
  let page = 1;

  while (true) {
    const data = await requestGateway(
      `${path}${separator}page=${page}&per_page=${API_PAGE_SIZE}`,
      { method: "GET" }
    );

    results.push(...(data.result ?? []));

    const totalPages = data.result_info?.total_pages ?? 1;

    if (page >= totalPages) break;

    page++;
  }

  return results;
};

/**
 * Normalizes a domain.
 * @param {string} value The value to be normalized.
 * @param {boolean} isAllowlisting Whether the value is to be allowlisted.
 * @returns {string}
 */
export const normalizeDomain = (value, isAllowlisting) => {
  const normalized = value
    .replace(/(0\.0\.0\.0|127\.0\.0\.1|::1|::)\s+/, "")
    .replace("||", "")
    .replace("^$important", "")
    .replace("*.", "")
    .replace("^", "");

  if (isAllowlisting) return normalized.replace("@@||", "");

  return normalized;
};
