import { a as ensure_array_like, c as attr, h as stringify, e as escape_html, d as attr_class } from "../../../chunks/index.js";
import "dexie";
import "../../../chunks/database.js";
function describeSchedule(routine) {
  switch (routine.scheduleType) {
    case "daily":
      return "Every day";
    case "everyN":
      return `Every ${routine.scheduleInterval ?? 1} days`;
    case "weekly": {
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const days = (routine.scheduleDays ?? []).map((d) => dayNames[d]).join(", ");
      return `Weekly: ${days}`;
    }
    case "custom":
      return `Every ${routine.scheduleInterval ?? 1} days (custom)`;
    default:
      return "Unknown";
  }
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let routines = [];
    $$renderer2.push(`<div class="page svelte-mdbb8q"><div class="page-header svelte-mdbb8q"><h2 class="headline-small">Routines</h2></div> `);
    if (routines.length === 0) {
      $$renderer2.push(`<!--[0--><div class="empty-state svelte-mdbb8q"><span class="empty-icon svelte-mdbb8q">📋</span> <p class="body-large">No routines yet</p> <p class="body-medium empty-hint svelte-mdbb8q">Tap + to create your first routine</p></div>`);
    } else {
      $$renderer2.push(`<!--[-1--><div class="routine-list svelte-mdbb8q"><!--[-->`);
      const each_array = ensure_array_like(routines);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let routine = each_array[$$index];
        $$renderer2.push(`<a${attr("href", `/routines/${stringify(routine.id)}`)} class="routine-card svelte-mdbb8q"><div class="routine-info svelte-mdbb8q"><span class="routine-title title-medium svelte-mdbb8q">${escape_html(routine.title)}</span> <span class="routine-schedule body-medium svelte-mdbb8q">${escape_html(describeSchedule(routine))}</span></div> <button${attr_class("toggle-btn svelte-mdbb8q", void 0, { "active": routine.isActive })} aria-label="Toggle active"><span class="toggle-track svelte-mdbb8q"><span class="toggle-thumb svelte-mdbb8q"></span></span></button></a>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--> <a href="/routines/new" class="fab svelte-mdbb8q" aria-label="Create new routine"><span class="fab-icon svelte-mdbb8q">+</span></a></div>`);
  });
}
export {
  _page as default
};
