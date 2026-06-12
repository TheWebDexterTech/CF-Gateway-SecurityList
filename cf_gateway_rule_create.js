import { createZeroTrustRule, getManagedLists } from "./lib/api.js";

const lists = await getManagedLists();

if (!lists.length) {
  console.warn(
    "No filter lists found - run cf_list_create.js first. Exiting."
  );
} else {
  const wirefilterExpression = lists
    .map(({ id }) => `any(dns.domains[*] in $${id})`)
    .join(" or ");

  await createZeroTrustRule(wirefilterExpression);
  console.log(`Created rule referencing ${lists.length} list(s).`);
}
