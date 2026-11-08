import { i as ssr_context, e as escape_html } from "../../../../../chunks/index.js";
import "clsx";
import "@sveltejs/kit/internal";
import "../../../../../chunks/exports.js";
import "../../../../../chunks/utils2.js";
import "@sveltejs/kit/internal/server";
import "../../../../../chunks/root.js";
import "../../../../../chunks/state.svelte.js";
import "../../../../../chunks/database.js";
function onDestroy(fn) {
  /** @type {SSRContext} */
  ssr_context.r.on_destroy(fn);
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    onDestroy(() => {
    });
    $$renderer2.push(`<div class="session-page svelte-15bgrgl"><div class="session-header svelte-15bgrgl"><button class="back-btn svelte-15bgrgl">← Back</button> <h2 class="title-large">${escape_html("Loading...")}</h2></div> `);
    {
      $$renderer2.push(`<!--[0--><div class="loading-state svelte-15bgrgl"><p class="body-large">Loading session...</p></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
