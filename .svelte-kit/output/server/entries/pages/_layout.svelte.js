import { g as getContext, a as ensure_array_like, c as attr, d as attr_class, f as store_get, e as escape_html, u as unsubscribe_stores } from "../../chunks/index.js";
import "clsx";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils2.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/root.js";
import "../../chunks/state.svelte.js";
const getStores = () => {
  const stores = getContext("__svelte__");
  return {
    /** @type {typeof page} */
    page: {
      subscribe: stores.page.subscribe
    },
    /** @type {typeof navigating} */
    navigating: {
      subscribe: stores.navigating.subscribe
    },
    /** @type {typeof updated} */
    updated: stores.updated
  };
};
const page = {
  subscribe(fn) {
    const store = getStores().page;
    return store.subscribe(fn);
  }
};
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let { children } = $$props;
    const navItems = [
      { href: "/", label: "Today", icon: "📅" },
      { href: "/routines", label: "Routines", icon: "📋" },
      { href: "/history", label: "History", icon: "📊" }
    ];
    function isActive(path, currentPath) {
      if (path === "/") return currentPath === "/";
      return currentPath.startsWith(path);
    }
    $$renderer2.push(`<div class="app-shell svelte-12qhfyh"><header class="top-bar svelte-12qhfyh"><h1 class="top-bar-title svelte-12qhfyh">Routine</h1></header> <main class="main-content svelte-12qhfyh">`);
    children($$renderer2);
    $$renderer2.push(`<!----></main> <nav class="bottom-nav svelte-12qhfyh"><!--[-->`);
    const each_array = ensure_array_like(navItems);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let item = each_array[$$index];
      $$renderer2.push(`<a${attr("href", item.href)}${attr_class("nav-item svelte-12qhfyh", void 0, {
        "active": isActive(item.href, store_get($$store_subs ??= {}, "$page", page).url.pathname)
      })}><span class="nav-icon svelte-12qhfyh">${escape_html(item.icon)}</span> <span class="nav-label svelte-12qhfyh">${escape_html(item.label)}</span></a>`);
    }
    $$renderer2.push(`<!--]--></nav></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _layout as default
};
