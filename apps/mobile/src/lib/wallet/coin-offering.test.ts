/**
 * The Offering's metadata is dashboard-authored JSON: only the expected strings are kept.
 */

import { packDisplayFromMetadata } from "@/lib/wallet/coin-offering";

describe("packDisplayFromMetadata", () => {
  test("reads each pack's label and badge", () => {
    expect(
      packDisplayFromMetadata({
        packs: { coins_large: { badge: "Best Value" }, coins_small: { label: "Starter" } },
      }),
    ).toEqual({ coins_large: { badge: "Best Value" }, coins_small: { label: "Starter" } });
  });

  test("ignores anything that is not the expected shape", () => {
    expect(packDisplayFromMetadata(null)).toEqual({});
    expect(packDisplayFromMetadata({ packs: [] })).toEqual({});
    expect(packDisplayFromMetadata({ packs: { coins_small: "Starter", coins_medium: { label: 3, badge: "" } } })).toEqual({
      coins_medium: {},
    });
  });
});
