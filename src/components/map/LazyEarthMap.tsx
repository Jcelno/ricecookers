import { forwardRef, lazy, Suspense } from "react";

import { useStore } from "@/store";
import { Spinner } from "@/components/ui/primitives";

import type { EarthMapProps } from "./EarthMap";
import type { GlobeHandle } from "./GlobeView";

// MapLibre is only needed for Earth views, so it is downloaded the first time one opens.
const Impl = lazy(() => import("./EarthMap").then((m) => ({ default: m.EarthMap })));

export const EarthMap = forwardRef<GlobeHandle, EarthMapProps>(function LazyEarthMap(props, ref) {
  const boundaries = useStore(s => s.layers.earth.boundaries);
  return (
    <Suspense fallback={<div className="absolute inset-0 grid place-items-center bg-void"><Spinner label="Loading the Earth map" /></div>}>
      <Impl ref={ref} {...props} boundaries={props.boundaries ?? boundaries} />
    </Suspense>
  );
});
export { LABEL_ATTRIBUTION } from "@/lib/attribution";
