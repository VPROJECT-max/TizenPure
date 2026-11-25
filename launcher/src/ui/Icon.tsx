import { ICONS } from "../icons/lucide";

export const Icon = ({ name, size = 40, className }: { name: string; size?: number; className?: string }) => (
  <svg
    class={className ? "icon " + className : "icon"}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS["app-window"] }}
  />
);
