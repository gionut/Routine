import { e as escape_html } from "../../chunks/index.js";
import "clsx";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils2.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/root.js";
import "../../chunks/state.svelte.js";
import "../../chunks/database.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const todayDate = /* @__PURE__ */ (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    $$renderer2.push(`<div class="today-page svelte-1uha8ag"><div class="date-header svelte-1uha8ag"><span class="date-label label-large svelte-1uha8ag">📅 ${escape_html(todayDate)}</span></div> `);
    {
      $$renderer2.push(`<!--[0--><div class="loading-state svelte-1uha8ag"><p class="body-large">Loading routines...</p></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
