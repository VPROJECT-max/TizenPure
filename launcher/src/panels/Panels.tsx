import type { Translate } from "../i18n";
import type { InputSource, InstalledApp } from "../platform/types";
import { AppTile } from "../ui/AppTile";
import { Icon } from "../ui/Icon";

export interface SheetAction {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly danger?: boolean;
}

export const ActionSheet = ({ title, actions, index }: { title: string; actions: SheetAction[]; index: number }) => (
  <div class="scrim">
    <div class="sheet glass" role="menu">
      <div class="sheet-title">{title}</div>
      {actions.map((a, i) => (
        <div key={a.id} class={"sheet-row" + (i === index ? " is-focused" : "") + (a.danger ? " is-danger" : "")}>
          <Icon name={a.icon} size={30} />
          <span>{a.label}</span>
        </div>
      ))}
    </div>
  </div>
);

export const FolderView = ({
  name,
  apps,
  index,
  tv,
  labels,
}: {
  name: string;
  apps: InstalledApp[];
  index: number;
  tv: boolean;
  labels: boolean;
}) => (
  <div class="scrim">
    <div class="folder-view glass">
      <div class="folder-name">{name}</div>
      <div class="folder-grid">
        {apps.map((app, i) => (
          <AppTile key={app.id} app={app} tv={tv} focused={i === index} label={labels} />
        ))}
      </div>
    </div>
  </div>
);

export interface PanelTile {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly detail?: string;
  readonly dim?: boolean;
  readonly wide?: boolean;
}

export const ControlCenter = ({
  t,
  inputs,
  shortcuts,
  index,
}: {
  t: Translate;
  inputs: PanelTile[];
  shortcuts: PanelTile[];
  index: number;
}) => {
  const all = [...inputs, ...shortcuts];
  const tile = (item: PanelTile) => {
    const i = all.indexOf(item);
    return (
      <div
        key={item.id}
        class={"cc-tile" + (i === index ? " is-focused" : "") + (item.dim ? " is-dim" : "") + (item.wide ? " is-wide" : "")}
      >
        <Icon name={item.icon} size={38} />
        <div class="cc-label">{item.label}</div>
        {item.detail ? <div class="cc-detail">{item.detail}</div> : null}
      </div>
    );
  };
  return (
    <div class="scrim scrim-top">
      <aside class="control-center glass">
        <div class="cc-heading">{t("panel.inputs")}</div>
        <div class="cc-grid">{inputs.length ? inputs.map(tile) : <div class="cc-empty">{t("panel.noInputs")}</div>}</div>
        <div class="cc-grid cc-shortcuts">{shortcuts.map(tile)}</div>
      </aside>
    </div>
  );
};

export const inputTiles = (t: Translate, inputs: InputSource[]): PanelTile[] =>
  inputs.map((s) => ({
    id: "input:" + s.key,
    label: s.type === "TV" ? t("panel.liveTv") : s.label,
    icon: s.type === "TV" ? "radio-tower" : "hdmi-port",
    dim: !s.connected,
  }));

export interface SettingsRow {
  readonly id: string;
  readonly section?: string;
  readonly label: string;
  readonly value?: string;
  readonly kind: "choice" | "action" | "info";
  readonly swatch?: string;
}

export const SettingsPanel = ({ title, rows, index }: { title: string; rows: SettingsRow[]; index: number }) => {
  // Keep the focused row in view: render a window around it (cheap on low-end TVs).
  const WINDOW = 9;
  const start = Math.max(0, Math.min(index - 4, rows.length - WINDOW));
  const visible = rows.slice(start, start + WINDOW);
  return (
    <div class="scrim scrim-right">
      <aside class="settings glass">
        <div class="settings-title">{title}</div>
        <div class="settings-rows">
          {visible.map((row, i) => (
            <div key={row.id}>
              {row.section ? <div class="settings-section">{row.section}</div> : null}
              <div class={"settings-row is-" + row.kind + (start + i === index ? " is-focused" : "")}>
                <span class="settings-label">{row.label}</span>
                {row.value !== undefined ? (
                  <span class="settings-value">
                    {row.swatch ? <span class="swatch" style={{ background: row.swatch }} /> : null}
                    {row.kind === "choice" ? <Icon name="chevron-left" size={22} className="chev" /> : null}
                    {row.value}
                    {row.kind === "choice" ? <Icon name="chevron-right" size={22} className="chev" /> : null}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {start + WINDOW < rows.length ? <div class="settings-more" /> : null}
      </aside>
    </div>
  );
};

export const Toast = ({ text }: { text: string }) => (text ? <div class="toast glass">{text}</div> : null);
