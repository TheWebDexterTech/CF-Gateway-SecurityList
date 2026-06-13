import { createZeroTrustRule, getManagedLists } from "./lib/api.js";
import { isValidResourceId } from "./lib/utils.js";

const lists = await getManagedLists();

if (!lists.length) {
  console.warn(
    "No filter lists found - run cf_list_create.js first. Exiting."
  );
} else {
  const invalidList = lists.find(({ id }) => !isValidResourceId(id));

  if (invalidList) {
    throw new Error(
      `Refusing to build gateway rule - list "${invalidList.name}" has an unexpected ID format.`
    );
  }

  const wirefilterExpression = lists
    .map(({ id }) => `any(dns.domains[*] in $${id})`)
    .join(" or ");

  await createZeroTrustRule(wirefilterExpression);
  console.log(`Created rule referencing ${lists.length} list(s).`);
}
