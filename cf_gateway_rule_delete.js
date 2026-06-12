import { deleteZeroTrustRule, getZeroTrustRules } from "./lib/api.js";
import { RULE_NAME } from "./lib/constants.js";

const rules = await getZeroTrustRules();
const rule = rules.find(({ name }) => name === RULE_NAME);

if (!rule) {
  console.warn(
    "No rule with matching name found - this is not an issue if you haven't run the create script yet. Exiting."
  );
} else {
  console.log(`Deleting rule "${rule.name}"`);
  await deleteZeroTrustRule(rule.id);
}
