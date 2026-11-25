import { useEffect, useState } from "preact/hooks";

import { artworkSources, tileGlyph, tileHue } from "../shared/apps/artwork";
import type { InstalledApp } from "../platform/types";
import { Icon } from "./Icon";

interface Props {
  readonly app: InstalledApp;
  readonly tv: boolean;
  readonly focused?: boolean;
  readonly label?: boolean;
  readonly badge?: string;
}

// Remember which artwork URLs failed, so scrolling back never retries a broken file.
const failed = new Set<string>();

export const Artwork = ({ app, tv }: { app: InstalledApp; tv: boolean }) => {
  const sources = artworkSources(app, tv).filter((s) => !failed.has(s));
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [app.id]);
  const src = sources[index];
  if (src) {
    return (
      <img
        class="tile-art"
        src={src}
        alt=""
        decoding="async"
        onError={() => {
          failed.add(src);
          setIndex(index + 1);
        }}
      />
    );
  }
  const hue = tileHue(app.name);
  return (
    <div
      class="tile-art tile-generated"
      style={{
        background:
          // Calm, deep tones so generated tiles sit beside real artwork without shouting.
          "linear-gradient(150deg, hsl(" + hue + ",42%,44%) 0%, hsl(" + ((hue + 24) % 360) + ",48%,24%) 100%)",
      }}
    >
      <Icon name={tileGlyph(app.name)} size={70} />
    </div>
  );
};

export const AppTile = ({ app, tv, focused, label = true, badge }: Props) => (
  <div class={"tile" + (focused ? " is-focused" : "")}>
    <div class="tile-squircle">
      <Artwork app={app} tv={tv} />
      {badge ? <span class="tile-badge">{badge}</span> : null}
    </div>
    {label ? <div class="tile-label">{app.name}</div> : null}
  </div>
);
