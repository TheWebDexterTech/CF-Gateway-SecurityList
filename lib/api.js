import {
  CONCURRENCY,
  LIST_ITEM_SIZE,
  LIST_NAME_PREFIX,
  RULE_NAME,
} from "./constants.js";
import { requestGateway, requestGatewayAllPages } from "./helpers.js";
import { runWithConcurrency, sleep } from "./utils.js";

/**
 * Gets every Zero Trust list on the account, following pagination.
 *
 * API docs: https://developers.cloudflare.com/api/operations/zero-trust-lists-list-zero-trust-lists
 * @returns {Promise<Object[]>}
 */
export const getZeroTrustLists = () => requestGatewayAllPages("/lists");

/**
 * Gets the Zero Trust lists managed by this project.
 * @returns {Promise<Object[]>}
 */
export const getManagedLists = async () => {
  const lists = await getZeroTrustLists();

  return lists.filter(({ name }) => name.startsWith(LIST_NAME_PREFIX));
};

/**
 * Creates a Zero Trust list.
 *
 * API docs: https://developers.cloudflare.com/api/operations/zero-trust-lists-create-zero-trust-list
 * @param {string} name The name of the list.
 * @param {Object[]} items The domains in the list.
 * @param {string} items[].value The domain of an entry.
 * @returns {Promise}
 */
const createZeroTrustList = (name, items) =>
  requestGateway(`/lists`, {
    method: "POST",
    body: JSON.stringify({
      name,
      type: "DOMAIN",
      items,
    }),
  });

/**
 * Splits domains into list-sized chunks, named sequentially.
 * @param {string[]} items The domains.
 * @returns {{ name: string, items: { value: string }[] }[]}
 */
const buildListChunks = (items) => {
  const chunks = [];

  for (let i = 0, listNumber = 1; i < items.length; i += LIST_ITEM_SIZE) {
    chunks.push({
      name: `${LIST_NAME_PREFIX} - Chunk ${listNumber}`,
      items: items.slice(i, i + LIST_ITEM_SIZE).map((value) => ({ value })),
    });
    listNumber++;
  }

  return chunks;
};

/**
 * Creates Zero Trust lists sequentially, one chunk at a time.
 * @param {string[]} items The domains.
 */
export const createZeroTrustListsSequential = async (items) => {
  const chunks = buildListChunks(items);
  let remaining = chunks.length;

  for (const { name, items: chunkItems } of chunks) {
    try {
      await createZeroTrustList(name, chunkItems);
      await sleep();
      remaining--;
      console.log(`Created "${name}" list - ${remaining} left`);
    } catch (err) {
      console.error(`Could not create "${name}" - ${err.toString()}`);
    }
  }
};

/**
 * Creates Zero Trust lists with a bounded number of requests in flight at
 * once, instead of firing every request simultaneously.
 * @param {string[]} items The domains.
 */
export const createZeroTrustListsBatched = async (items) => {
  const chunks = buildListChunks(items);
  let remaining = chunks.length;

  const tasks = chunks.map(({ name, items: chunkItems }) => async () => {
    try {
      await createZeroTrustList(name, chunkItems);
      remaining--;
      console.log(`Created "${name}" list - ${remaining} left`);
    } catch (err) {
      console.error(`Could not create "${name}" - ${err.toString()}`);
    }
  });

  await runWithConcurrency(tasks, CONCURRENCY);
  console.log(`Created ${chunks.length} lists`);
};

/**
 * Deletes a Zero Trust list.
 *
 * API docs: https://developers.cloudflare.com/api/operations/zero-trust-lists-delete-zero-trust-list
 * @param {number} id The ID of the list.
 * @returns {Promise<any>}
 */
const deleteZeroTrustList = (id) =>
  requestGateway(`/lists/${id}`, { method: "DELETE" });

/**
 * Deletes Zero Trust lists sequentially.
 * @param {Object[]} lists The lists to be deleted.
 * @param {number} lists[].id The ID of a list.
 * @param {string} lists[].name The name of a list.
 */
export const deleteZeroTrustListsSequential = async (lists) => {
  let remaining = lists.length;

  for (const { id, name } of lists) {
    try {
      await deleteZeroTrustList(id);
      await sleep();
      remaining--;
      console.log(`Deleted ${name} list - ${remaining} left`);
    } catch (err) {
      console.error(`Could not delete ${name} - ${err.toString()}`);
    }
  }
};

/**
 * Deletes Zero Trust lists with a bounded number of requests in flight at
 * once, instead of firing every request simultaneously.
 * @param {Object[]} lists The lists to be deleted.
 * @param {number} lists[].id The ID of a list.
 * @param {string} lists[].name The name of a list.
 */
export const deleteZeroTrustListsBatched = async (lists) => {
  let remaining = lists.length;

  const tasks = lists.map(({ id, name }) => async () => {
    try {
      await deleteZeroTrustList(id);
      remaining--;
      console.log(`Deleted ${name} list - ${remaining} left`);
    } catch (err) {
      console.error(`Could not delete ${name} - ${err.toString()}`);
    }
  });

  await runWithConcurrency(tasks, CONCURRENCY);
  console.log(`Deleted ${lists.length} lists`);
};

/**
 * Gets every Zero Trust gateway rule on the account, following pagination.
 *
 * API docs: https://developers.cloudflare.com/api/operations/zero-trust-gateway-rules-list-zero-trust-gateway-rules
 * @returns {Promise<Object[]>}
 */
export const getZeroTrustRules = () => requestGatewayAllPages("/rules");

/**
 * Creates a Zero Trust rule.
 *
 * API docs: https://developers.cloudflare.com/api/operations/zero-trust-gateway-rules-create-zero-trust-gateway-rule
 * @param {string} wirefilterExpression The expression to be used for the rule.
 * @returns {Promise<Object>}
 */
export const createZeroTrustRule = (wirefilterExpression) =>
  requestGateway("/rules", {
    method: "POST",
    body: JSON.stringify({
      name: RULE_NAME,
      description: "DNS block rule managed by CF-Gateway-SecurityList.",
      enabled: true,
      action: "block",
      filters: ["dns"],
      traffic: wirefilterExpression,
    }),
  });

/**
 * Deletes a Zero Trust rule.
 *
 * API docs: https://developers.cloudflare.com/api/operations/zero-trust-gateway-rules-delete-zero-trust-gateway-rule
 * @param {number} id The ID of the rule to be deleted.
 * @returns {Promise<Object>}
 */
export const deleteZeroTrustRule = (id) =>
  requestGateway(`/rules/${id}`, {
    method: "DELETE",
  });
