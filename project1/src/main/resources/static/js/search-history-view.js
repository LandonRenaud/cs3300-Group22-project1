function searchLabel(entry) {
  return entry.query || entry.options.keyword || "Current map area";
}

function describeFilters(entry) {
  const { keyword, type, openNow, rankBy, radius, price } = entry.options;
  const filters = [];
  if (entry.query && keyword) filters.push(`Keyword: ${keyword}`);
  if (type && type !== "point_of_interest") {
    const label = type.replaceAll("_", " ");
    filters.push(label.charAt(0).toUpperCase() + label.slice(1));
  }
  if (rankBy !== "distance" && Number.isFinite(radius)) {
    filters.push(radius >= 1000 ? `Radius: ${radius / 1000} km` : `Radius: ${radius} m`);
  }
  if (price !== null && price !== undefined && price !== "") {
    const level = Number(price);
    if (Number.isInteger(level) && level >= 0 && level <= 4) {
      filters.push(level === 0 ? "Free" : "$".repeat(level));
    }
  }
  if (openNow) filters.push("Open now");
  filters.push(rankBy === "distance" ? "Rank: distance" : "Rank: prominence");
  return filters.join(" · ");
}

/** Render normalized history entries without interpreting any saved text as HTML. */
export function createSearchHistoryView({ root, onReplay, onRemove, onClear }) {
  const documentRef = root.ownerDocument;
  const list = root.querySelector(".search-history-list");
  const count = root.querySelector(".search-history-count");
  const empty = root.querySelector(".search-history-empty");
  const clear = root.querySelector(".search-history-clear");
  const storage = root.querySelector(".search-history-storage");
  const warning = root.querySelector(".search-history-warning");
  const status = root.querySelector(".search-history-status");
  let previousIds = null;

  const clearHistory = () => onClear();
  clear.addEventListener("click", clearHistory);

  function render(entries, { persistent = true } = {}) {
    const active = documentRef.activeElement;
    const focusedId = active?.closest?.(".search-history-entry")?.dataset.historyId;
    const wasClearFocused = active === clear;
    const focusIndex = previousIds?.indexOf(focusedId) ?? -1;
    const sorted = [...entries].sort((a, b) => new Date(b.searchedAt) - new Date(a.searchedAt));
    const nextIds = sorted.map(entry => entry.id);
    const removedCount = previousIds?.filter(id => !nextIds.includes(id)).length || 0;

    count.textContent = `(${sorted.length})`;
    empty.hidden = sorted.length > 0;
    clear.hidden = sorted.length === 0;
    storage.hidden = !persistent;
    warning.hidden = persistent;
    list.replaceChildren();

    for (const entry of sorted) {
      const item = documentRef.createElement("li");
      item.className = "search-history-entry";
      item.dataset.historyId = entry.id;
      const label = searchLabel(entry);
      const replay = documentRef.createElement("button");
      replay.type = "button";
      replay.className = "search-history-replay";
      replay.setAttribute("aria-label", `Search again: ${label}`);
      replay.addEventListener("click", () => onReplay(entry));
      const title = documentRef.createElement("strong");
      title.textContent = label;
      const filters = documentRef.createElement("span");
      filters.className = "search-history-filters";
      filters.textContent = describeFilters(entry);
      const time = documentRef.createElement("time");
      time.className = "search-history-time";
      const date = new Date(entry.searchedAt);
      if (Number.isFinite(date.getTime())) {
        time.dateTime = date.toISOString();
        time.textContent = date.toLocaleString(undefined, {
          month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
        });
      }
      replay.append(title, filters, time);
      const remove = documentRef.createElement("button");
      remove.type = "button";
      remove.className = "search-history-remove";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Remove search: ${label}`);
      remove.title = `Remove search: ${label}`;
      remove.addEventListener("click", () => onRemove(entry.id));
      item.append(replay, remove);
      list.append(item);
    }

    if (removedCount) {
      status.textContent = sorted.length === 0 ? "Search history cleared."
        : `${removedCount} ${removedCount === 1 ? "search removed" : "searches removed"} from history.`;
    } else {
      status.textContent = "";
    }

    // Rebuilding the list should not strand keyboard focus after removing an entry.
    if (focusedId) {
      const retainedIndex = nextIds.indexOf(focusedId);
      const index = retainedIndex >= 0 ? retainedIndex : Math.min(focusIndex, sorted.length - 1);
      const target = index >= 0 ? list.children[index].querySelector(
        active.classList.contains("search-history-remove") ? ".search-history-remove" : ".search-history-replay"
      ) : root.querySelector("summary");
      target?.focus();
    } else if (wasClearFocused && sorted.length === 0) {
      root.querySelector("summary").focus();
    }
    previousIds = nextIds;
  }

  function destroy() {
    clear.removeEventListener("click", clearHistory);
  }

  return { render, destroy };
}
