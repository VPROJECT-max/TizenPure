import type { InstalledApp } from "../platform/types";
import type { Translate } from "../i18n";
import type { Item } from "../services/layout";
import { isFolder } from "../services/layout";
import type { Settings } from "../services/preferences";
import type { HomeFocus } from "../shared/navigation";
import { AppTile, Artwork } from "../ui/AppTile";
import { Icon } from "../ui/Icon";
import { Clock } from "./Clock";

interface Props {
  readonly pages: Item[][];
  readonly dock: InstalledApp[];
  readonly apps: Map<string, InstalledApp>;
  readonly focus: HomeFocus;
  readonly settings: Settings;
  readonly tv: boolean;
  readonly editing: boolean;
  readonly moving: boolean;
  readonly picking: boolean;
  readonly t: Translate;
  readonly watcherNote: string;
  readonly lang: string;
}

const FolderTile = ({
  name,
  apps,
  tv,
  focused,
  label,
}: {
  name: string;
  apps: InstalledApp[];
  tv: boolean;
  focused: boolean;
  label: boolean;
}) => (
  <div class={"tile" + (focused ? " is-focused" : "")}>
    <div class="tile-squircle tile-folder">
      {apps.slice(0, 4).map((app) => (
        <div class="folder-mini" key={app.id}>
          <Artwork app={app} tv={tv} />
        </div>
      ))}
    </div>
    {label ? <div class="tile-label">{name}</div> : null}
  </div>
);

export const HomeView = (p: Props) => {
  const { focus, settings, t } = p;
  const page = p.pages[focus.page] || [];
  return (
    <main
      class={
        "home" +
        (p.editing ? " is-editing" : "") +
        (p.moving ? " is-moving" : "") +
        (settings.clock === "off" || settings.clockSize === "compact" || settings.rows === 3 ? " is-compact" : "")
      }
    >
      <header class="home-top">
        {settings.clock !== "off" ? <Clock format={settings.clock} size={settings.clockSize} lang={p.lang} /> : <div />}
        <div class="home-status">
          {p.watcherNote ? <span class="status-note">{p.watcherNote}</span> : null}
          <span class="status-hint">
            <Icon name="sliders-horizontal" size={26} />
          </span>
        </div>
      </header>

      <section class={"grid cols-" + settings.columns + " rows-" + settings.rows + " size-" + settings.iconSize}>
        {page.length === 0 ? <p class="grid-empty">{t("home.empty")}</p> : null}
        {page.map((item, index) => {
          const focused = focus.zone === "grid" && focus.index === index;
          if (isFolder(item)) {
            const apps = item.apps.map((id) => p.apps.get(id)).filter((a): a is InstalledApp => !!a);
            return (
              <FolderTile
                key={item.folder}
                name={item.name}
                apps={apps}
                tv={p.tv}
                focused={focused}
                label={settings.labels}
              />
            );
          }
          const app = p.apps.get(item);
          return app ? (
            <AppTile
              key={item}
              app={app}
              tv={p.tv}
              focused={focused}
              label={settings.labels}
              badge={focused && p.moving ? "↔" : undefined}
            />
          ) : null;
        })}
      </section>

      <div class="page-dots" aria-label={t("home.page", { n: focus.page + 1, total: p.pages.length })}>
        {p.pages.length > 1
          ? p.pages.map((_, i) => <span key={i} class={"dot" + (i === focus.page ? " is-current" : "")} />)
          : null}
      </div>

      <footer class="dock-wrap">
        {p.editing ? (
          <div class="edit-hint">{p.picking ? t("app.folderPick") : t("home.editHint")}</div>
        ) : null}
        {p.dock.length ? (
          <div class={"dock size-" + settings.iconSize}>
            {p.dock.map((app, index) => (
              <AppTile
                key={app.id}
                app={app}
                tv={p.tv}
                focused={focus.zone === "dock" && focus.index === index}
                label={false}
              />
            ))}
          </div>
        ) : null}
      </footer>
    </main>
  );
};
