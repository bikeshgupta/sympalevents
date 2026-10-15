import { useSearchParams } from "react-router-dom";
import { defaultPlatformRange, platformWindow, readPlatformRange, type PlatformRangePreset } from "../../../shared/platform-range";

/**
 * The selected reporting window, kept in the address (`?range=90d`) so it survives a refresh, the back button and
 * a drill-down link. The default (30 days) is left out of the address. The window itself comes from
 * shared/platform-range.ts, the same function the API uses, so both sides cut IST days identically. It is cheap,
 * so it is simply recomputed on each render; a page left open past midnight moves on with the clock.
 */
export function usePlatformRange() {
  const [params, setParams] = useSearchParams();
  const preset = readPlatformRange(params.get("range"));
  const window = platformWindow(preset);

  function setPreset(next: PlatformRangePreset) {
    const nextParams = new URLSearchParams(params);
    if (next === defaultPlatformRange) nextParams.delete("range");
    else nextParams.set("range", next);
    setParams(nextParams, { replace: true });
  }

  return { preset, window, setPreset };
}
