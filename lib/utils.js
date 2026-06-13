import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";

import { REQUEST_TIMEOUT_MS } from "./constants.js";

/**
 * Sleeps for a specified amount of time.
 * @param {number} [ms=350] The amount of time in ms.
 */
export const sleep = (ms = 350) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Checks if the value is a valid domain.
 * @param {string} value The value to be checked.
 */
export const isValidDomain = (value) =>
  /^(?!-)[A-Za-z0-9-]+([\-\.]{1}[a-z0-9]+)*\.[A-Za-z]{2,6}$/.test(value);

/**
 * Checks if the value is a Cloudflare resource ID (UUID), as used for
 * Zero Trust list/rule IDs. Used to validate API responses before they're
 * interpolated into a wirefilter expression.
 * @param {string} value The value to be checked.
 */
export const isValidResourceId = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );

/**
 * Extracts all subdomains from a domain including itself.
 * @param {string} domain The domain to be extracted.
 * @returns {string[]}
 */
export const extractDomain = (domain) =>
  domain.split(".").reduce((previous, current, index, array) => {
    const nextIndex = index + 1;

    if (nextIndex > array.length - 1) return previous;

    const domain = [current, ...array.slice(nextIndex)].join(".");

    previous.push(domain);

    return previous;
  }, []);

/**
 * Checks if the value is a comment.
 * @param {string} value The value to be checked.
 */
export const isComment = (value) =>
  value.startsWith("#") ||
  value.startsWith("//") ||
  value.startsWith("!") ||
  value.startsWith("/*") ||
  value.startsWith("*/");

/**
 * Downloads files sequentially and appends their contents into one file.
 * Each download is fully streamed to disk (and newline-separated) before
 * the next one starts, so callers can rely on the file being complete
 * once this resolves.
 * @param {string} filePath The path to the file being written to.
 * @param {string[]} urls The URLs to the files to be downloaded.
 */
export const downloadFiles = async (filePath, urls) => {
  const writeStream = createWriteStream(filePath, { flags: "a" });

  try {
    for (const url of urls) {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!response.ok || !response.body) {
        console.error(`Skipping ${url} - HTTP ${response.status}`);
        continue;
      }

      for await (const chunk of response.body) {
        if (!writeStream.write(chunk)) {
          await once(writeStream, "drain");
        }
      }
      writeStream.write("\n");
    }
  } finally {
    await new Promise((resolve, reject) =>
      writeStream.close((err) => (err ? reject(err) : resolve()))
    );
  }
};

/**
 * @callback onLine
 * @param {string} line The current line.
 * @param {ReturnType<createInterface>} rl The readline interface.
 */

/**
 * Asynchronously reads a file line by line.
 * @param {string} filePath The path to the file.
 * @param {onLine} onLine The callback executed on each line read.
 */
export const readFile = async (filePath, onLine) => {
  try {
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => onLine(line, rl));

    await once(rl, "close");
  } catch (err) {
    console.error(
      `Error occurred while reading ${basename(filePath)} - ${err.toString()}`
    );
  }
};

/**
 * Runs a list of task factories with a bounded number running at once.
 * @template T
 * @param {Array<() => Promise<T>>} tasks Functions that start an async task when called.
 * @param {number} limit The maximum number of tasks running concurrently.
 * @returns {Promise<void>}
 */
export const runWithConcurrency = async (tasks, limit) => {
  const queue = [...tasks];

  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    let task;
    while ((task = queue.shift())) {
      await task();
    }
  });

  await Promise.all(workers);
};
