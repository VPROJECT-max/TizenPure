import { useEffect, useState } from "preact/hooks";

const pad = (n: number) => (n < 10 ? "0" + n : String(n));

export const formatTime = (date: Date, format: "24h" | "12h") => {
  const h = date.getHours();
  return format === "24h" ? pad(h) + ":" + pad(date.getMinutes()) : (h % 12 || 12) + ":" + pad(date.getMinutes());
};

// Updates once a minute, aligned to the minute: no per-second repaint on a slow GPU.
export const Clock = ({ format, size, lang }: { format: "24h" | "12h"; size: "large" | "compact"; lang: string }) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setNow(new Date());
        schedule();
      }, 60000 - (Date.now() % 60000) + 50);
    };
    schedule();
    const wake = () => !document.hidden && setNow(new Date());
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);
  const date = (() => {
    try {
      return now.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" });
    } catch {
      return now.toDateString();
    }
  })();
  return (
    <div class={"clock clock-" + size}>
      <div class="clock-time">{formatTime(now, format)}</div>
      <div class="clock-date">{date}</div>
    </div>
  );
};
