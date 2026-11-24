import { useState, type ReactElement } from "react";

import { SlotSpellerScreen } from "@/components/screens/slot-speller/slot-speller-screen";
import { loadSlotRun, persistSlotChange } from "@/features/slot-speller/slot-speller-save";

/** Slot Speller resumes the device's saved run, and saves every change to it. */
export default function SlotSpellerRoute(): ReactElement {
  const [saved] = useState(loadSlotRun);
  return <SlotSpellerScreen initialState={saved ?? undefined} onChange={persistSlotChange} />;
}
