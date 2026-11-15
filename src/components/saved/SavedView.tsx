import {
  ArrowUpRight,
  Bookmark,
  Check,
  Download,
  FolderOpen,
  GitCompareArrows,
  MapPin,
  Pencil,
  Rocket,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button, GradeTile, Notice, cx } from "@/components/ui/primitives";
import { formatCoord } from "@/lib/format";
import {
  type SavedComparison,
  type SavedKind,
  type SavedMission,
  type SavedSite,
  type SavedState,
  writeSaved,
} from "@/lib/persistence";
import { useStore } from "@/store";

type Entry = {
  kind: SavedKind;
  index: number;
  item: SavedSite | SavedMission | SavedComparison;
};
const title = (e: Entry) => ("label" in e.item ? e.item.label : e.item.name);
const names = {
  sites: "Places",
  comparisons: "Comparisons",
  missions: "Missions",
};
const icons = {
  sites: MapPin,
  comparisons: GitCompareArrows,
  missions: Rocket,
};
const date = (value?: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Previously saved";
function download(saved: SavedState) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "radium-saved-research.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ResearchCard({
  entry,
  collections,
  onDelete,
}: {
  entry: Entry;
  collections: string[];
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title(entry));
  const [folder, setFolder] = useState(entry.item.collection ?? "");
  const { kind, index, item } = entry;
  const Icon = icons[kind];
  const context = item.context;
  const places =
    "sites" in item
      ? item.sites
      : "site" in item
        ? item.site
          ? [item.site]
          : []
        : [item];
  const sources = item.sources ?? [];
  const finish = () => {
    const s = useStore.getState();
    s.renameSaved(kind, index, name);
    s.organizeSaved(kind, index, folder);
    setEditing(false);
  };
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-[var(--hair)] bg-[var(--surface)] p-5 shadow-[0_12px_32px_-22px_#000]">
      <div className="flex items-center gap-2 text-xs text-regolith-400">
        <Icon size={15} className="text-world" />
        <span>{names[kind].replace(/s$/, "")}</span>
        <span className="ml-auto">{date(item.created)}</span>
      </div>
      {editing ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            finish();
          }}
        >
          <label className="block text-xs text-regolith-300">
            Research name
            <input
              autoFocus
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field mt-1 w-full"
            />
          </label>
          <label className="block text-xs text-regolith-300">
            Collection
            <input
              value={folder}
              maxLength={80}
              onChange={(e) => setFolder(e.target.value)}
              list={`collections-${kind}-${index}`}
              placeholder="e.g. Space Apps presentation"
              className="field mt-1 w-full"
            />
          </label>
          <datalist id={`collections-${kind}-${index}`}>
            {collections.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div className="flex gap-2">
            <Button type="submit" variant="solid" size="sm">
              <Check size={13} />
              Save changes
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setName(title(entry));
                setFolder(item.collection ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <h2 className="placename mt-3 text-xl leading-snug text-regolith-50 [overflow-wrap:anywhere]">
          {title(entry)}
        </h2>
      )}
      {item.collection && (
        <span className="mt-2 inline-flex items-center gap-1.5 self-start rounded-full bg-basalt-700 px-2 py-1 text-2xs text-regolith-200">
          <FolderOpen size={11} />
          {item.collection}
        </span>
      )}
      <div className="mt-3 space-y-1 text-xs text-regolith-300">
        {places.map((site, i) => (
          <p key={`${site.body}-${i}`} className="leading-relaxed">
            <span className="mr-1 font-semibold capitalize">{site.body}</span>
            {formatCoord(site.lat, site.lon)}
            {places.length > 1 && (
              <span className="block text-regolith-400">{site.label}</span>
            )}
          </p>
        ))}
        {!places.length && (
          <p>No destination selected. Mission settings are saved.</p>
        )}
      </div>
      {context ? (
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-basalt-950/65 p-3">
          <GradeTile grade={context.grade} size="md" />
          <div className="text-xs">
            <p className="font-medium capitalize text-regolith-100">
              {context.model}
            </p>
            <p className="mt-0.5 text-regolith-400">
              {context.purpose.replace(/_/g, " ")} ·{" "}
              {Math.round(context.coverage * 100)}% data coverage
            </p>
            <p className="mt-0.5 text-2xs text-regolith-500">
              {context.excluded
                ? "Ruled out by mission hard limits"
                : "Saved assessment · recalculated when reopened"}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-basalt-950/50 px-3 py-2 text-xs text-regolith-400">
          {"kind" in item && item.kind === "sites"
            ? "Measured environment comparison · no aggregate grade"
            : "No calculated grade saved"}
        </p>
      )}
      <details className="mt-3 text-xs text-regolith-300">
        <summary className="ctl cursor-pointer rounded py-2 text-regolith-200">
          Evidence & saved settings
          {sources.length > 0 ? ` · ${sources.length} sources` : ""}
        </summary>
        {"mission" in item && (
          <p className="my-2 leading-relaxed">
            Mission: {item.mission.replace(/_/g, " ")}
            <br />
            Priorities:{" "}
            {Object.entries(item.weights)
              .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
              .join("; ")}
            <br />
            Hard limits: {item.limits.join(", ") || "none"}
          </p>
        )}
        {"purpose" in item && (
          <p className="my-2">Purpose: {item.purpose.replace(/_/g, " ")}</p>
        )}
        {context && (
          <p className="my-2 leading-relaxed">
            {context.modelVersion} · assessed {date(context.assessedAt)}
            <br />
            {Object.entries(context.weights)
              .map(([k, v]) => `${k.replace(/_/g, " ")} ${Math.round(v)}`)
              .join("; ")}
          </p>
        )}
        {sources.length ? (
          <ul className="space-y-2 pb-2">
            {sources.map((source, i) => (
              <li key={`${source.url}-${i}`}>
                <a
                  className="link break-words"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.title} ↗
                </a>
                {source.role && (
                  <span className="block text-2xs text-regolith-500">
                    {source.role}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pb-2 text-regolith-400">
            Source references were not captured in this saved record. Reopen it
            to inspect the current evidence.
          </p>
        )}
        {"registry" in item && item.registry && (
          <p className="pb-2 leading-relaxed text-regolith-400">
            {item.registry.note}
          </p>
        )}
      </details>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
        <Button
          variant="solid"
          onClick={() => void useStore.getState().openSaved(kind, index)}
        >
          <ArrowUpRight size={14} />
          Open{" "}
          {kind === "sites"
            ? "place"
            : kind === "missions"
              ? "mission"
              : "comparison"}
        </Button>
        <Button
          size="sm"
          title={`Rename or organize ${title(entry)}`}
          aria-label={`Rename or organize ${title(entry)}`}
          onClick={() => setEditing(!editing)}
        >
          <Pencil size={14} />
        </Button>
        <Button
          size="sm"
          className="ml-auto"
          title={`Delete ${title(entry)}`}
          aria-label={`Delete ${title(entry)}`}
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </article>
  );
}

export function SavedView() {
  const saved = useStore((s) => s.saved);
  const error = useStore((s) => s.persistenceError);
  const notice = useStore((s) => s.saveNotice);
  const [kind, setKind] = useState<SavedKind | "all">("all");
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState("");
  const [deleted, setDeleted] = useState<{
    entry: Entry;
    title: string;
  } | null>(null);
  const entries = useMemo(
    () =>
      (["sites", "comparisons", "missions"] as SavedKind[]).flatMap((kind) =>
        saved[kind].map((item, index) => ({ kind, item, index }) as Entry),
      ),
    [saved],
  );
  const collections = useMemo(
    () =>
      [
        ...new Set(
          entries.map((e) => e.item.collection).filter((c): c is string => !!c),
        ),
      ].sort(),
    [entries],
  );
  const filtered = entries.filter(
    (e) =>
      (kind === "all" || kind === e.kind) &&
      (!collection || e.item.collection === collection) &&
      `${title(e)} ${e.kind} ${e.item.collection ?? ""} ${"body" in e.item ? e.item.body : ""} ${"purpose" in e.item ? e.item.purpose : ""}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  const remove = (entry: Entry) => {
    setDeleted({ entry, title: title(entry) });
    useStore.getState().removeSaved(entry.kind, entry.index);
  };
  const undo = () => {
    if (!deleted) return;
    const state = useStore.getState().saved;
    const k = deleted.entry.kind;
    const restored = {
      ...state,
      [k]: [deleted.entry.item, ...state[k]],
    } as SavedState;
    useStore.setState({
      saved: restored,
      persistenceError: writeSaved(restored),
      saveNotice: "Saved research restored.",
    });
    setDeleted(null);
  };
  return (
    <div className="scroll h-full w-full" data-tour="saved">
      <div className="mx-auto max-w-[1420px] px-5 py-7 sm:px-9 sm:py-10">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-world">
              Your research workspace
            </p>
            <h1 className="font-serif text-[2.5rem] leading-tight tracking-[-0.035em] text-regolith-50">
              Keep the discoveries that matter.
            </h1>
            <p className="mt-3 max-w-[66ch] text-sm leading-relaxed text-regolith-300">
              Revisit places, compare environments, and pick up a mission where
              you left it. Coordinates, evidence and available model settings
              stay with your research.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={!entries.length}
            onClick={() => download(saved)}
          >
            <Download size={15} />
            Export research
          </Button>
        </header>
        <p className="mt-4 flex items-center gap-2 text-xs text-regolith-400">
          <Bookmark size={13} />
          Saved in this browser · export a copy to keep or share your records.
          View links do not transfer your saved library.
        </p>
        {error && (
          <div className="mt-5">
            <Notice
              tone="warn"
              title="Research is not safely persisted"
              action={
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => useStore.getState().retryPersistence()}
                  >
                    Retry saving
                  </Button>
                  <Button size="sm" onClick={() => download(saved)}>
                    Export a copy
                  </Button>
                </div>
              }
            >
              {error}
            </Notice>
          </div>
        )}
        {deleted && (
          <div
            className="mt-4 flex items-center gap-2 rounded-lg bg-basalt-800 px-4 py-3 text-sm"
            role="status"
          >
            <span className="min-w-0 flex-1 truncate">
              Removed {deleted.title}
            </span>
            <Button size="sm" variant="outline" onClick={undo}>
              Undo
            </Button>
            <Button
              size="sm"
              aria-label="Dismiss deleted record notice"
              onClick={() => setDeleted(null)}
            >
              <X size={14} />
            </Button>
          </div>
        )}
        {notice && (
          <p className="mt-3 text-xs text-world" role="status">
            {notice}
          </p>
        )}
        <div className="my-6 flex flex-wrap items-center gap-3 border-y border-[var(--hair)] py-4">
          <div
            className="flex max-w-full gap-1 overflow-x-auto"
            role="tablist"
            aria-label="Saved research type"
          >
            {(["all", "sites", "comparisons", "missions"] as const).map((k) => (
              <button
                type="button"
                key={k}
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={cx(
                  "ctl shrink-0 rounded-lg px-3 py-2 text-sm",
                  kind === k ? "bg-world text-world-ink" : "text-regolith-300",
                )}
              >
                {k === "all" ? "All research" : names[k]}{" "}
                <span className="ml-1 opacity-70">
                  {k === "all" ? entries.length : saved[k].length}
                </span>
              </button>
            ))}
          </div>
          <label className="relative min-w-[180px] flex-1 sm:ml-auto sm:max-w-xs">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-regolith-400"
            />
            <input
              className="field w-full pl-9"
              aria-label="Search saved research"
              placeholder="Search your research…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            className="field max-w-full"
            aria-label="Filter by collection"
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
          >
            <option value="">All collections</option>
            {collections.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {filtered.length ? (
          <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((e) => (
              <ResearchCard
                key={`${e.kind}-${e.item.id ?? e.index}`}
                entry={e}
                collections={collections}
                onDelete={() => remove(e)}
              />
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-xl py-12 text-center">
            <div className="mx-auto mb-5 grid size-16 place-items-center rounded-full bg-basalt-800 text-world">
              <FolderOpen size={28} />
            </div>
            <h2 className="font-serif text-2xl text-regolith-50">
              {entries.length
                ? "No research matches these filters"
                : "Your next discovery starts here"}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-regolith-300">
              {entries.length
                ? "Try a different search, collection, or record type."
                : "Save a place from its detail panel, a comparison from Earth Analogs, or a mission from the final planning step. Your evidence will be waiting here."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {entries.length ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setCollection("");
                    setKind("all");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <>
                  <Button
                    variant="solid"
                    onClick={() => useStore.getState().setMode("explore")}
                  >
                    <MapPin size={14} />
                    Explore worlds
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => useStore.getState().setMode("mission")}
                  >
                    <Rocket size={14} />
                    Plan a mission
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default SavedView;
