import {
  deleteZeroTrustListsBatched,
  deleteZeroTrustListsSequential,
  getManagedLists,
} from "./lib/api.js";
import { FAST_MODE } from "./lib/constants.js";

const lists = await getManagedLists();

if (!lists.length) {
  console.warn(
    "No lists with matching name found - this is not an issue if you haven't created any filter lists before. Exiting."
  );
} else {
  console.log(`Found ${lists.length} list(s) to delete.`);

  if (FAST_MODE) {
    await deleteZeroTrustListsBatched(lists);
  } else {
    await deleteZeroTrustListsSequential(lists);
  }
}
