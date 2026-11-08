import { c as attr, a as ensure_array_like, d as attr_class, e as escape_html, h as stringify, j as derived } from "../../../../chunks/index.js";
import "@sveltejs/kit/internal";
import "../../../../chunks/exports.js";
import "../../../../chunks/utils2.js";
import "@sveltejs/kit/internal/server";
import "../../../../chunks/root.js";
import "../../../../chunks/state.svelte.js";
import "../../../../chunks/database.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let title = "";
    let scheduleType = "daily";
    let tasks = [];
    const scheduleTypes = [
      { value: "daily", label: "Daily" },
      { value: "everyN", label: "Every N Days" },
      { value: "weekly", label: "Weekly" },
      { value: "custom", label: "Custom" }
    ];
    function formatFileSize(bytes) {
      if (!bytes) return "";
      if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    function isYouTubeUrl(url) {
      return /(?:youtube\.com|youtu\.be)/.test(url);
    }
    function isPdfUrl(url) {
      return /\.pdf(?:$|[?#])/i.test(url);
    }
    let canSave = derived(() => title.trim().length > 0 && true);
    $$renderer2.push(`<div class="page svelte-1njc2kt"><div class="page-header svelte-1njc2kt"><h2 class="headline-small">New Routine</h2></div> <div class="card svelte-1njc2kt"><label class="field svelte-1njc2kt"><span class="label-large field-label svelte-1njc2kt">Title</span> <input type="text" class="text-input svelte-1njc2kt" placeholder="e.g. Morning Workout"${attr("value", title)} required=""/></label></div> <div class="card svelte-1njc2kt"><span class="label-large field-label svelte-1njc2kt">Schedule</span> <div class="segment-group svelte-1njc2kt"><!--[-->`);
    const each_array = ensure_array_like(scheduleTypes);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let st = each_array[$$index];
      $$renderer2.push(`<button${attr_class("segment-btn svelte-1njc2kt", void 0, { "selected": scheduleType === st.value })}>${escape_html(st.label)}</button>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="card svelte-1njc2kt"><div class="section-header svelte-1njc2kt"><span class="label-large field-label svelte-1njc2kt">Tasks</span> <button class="text-btn svelte-1njc2kt">+ Add Task</button></div> `);
    if (tasks.length === 0) {
      $$renderer2.push(`<!--[0--><p class="body-medium empty-tasks svelte-1njc2kt">No tasks yet. Add tasks to build your routine.</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <!--[-->`);
    const each_array_2 = ensure_array_like(tasks);
    for (let index = 0, $$length = each_array_2.length; index < $$length; index++) {
      let task = each_array_2[index];
      $$renderer2.push(`<div class="task-item svelte-1njc2kt"><div class="task-header svelte-1njc2kt"><span class="label-medium task-number svelte-1njc2kt">Task ${escape_html(index + 1)}</span> <button class="icon-btn delete-btn svelte-1njc2kt" aria-label="Delete task">✕</button></div> <label class="field svelte-1njc2kt"><span class="body-medium field-hint svelte-1njc2kt">Title</span> <input type="text" class="text-input svelte-1njc2kt" placeholder="Task title"${attr("value", task.title)}/></label> <label class="field svelte-1njc2kt"><span class="body-medium field-hint svelte-1njc2kt">Duration (minutes)</span> <input type="number" class="text-input small-input svelte-1njc2kt" min="1"${attr("value", task.durationMinutes)}/></label> <div class="field svelte-1njc2kt"><span class="body-medium field-hint svelte-1njc2kt">Link Type</span> <div class="link-type-group svelte-1njc2kt"><!--[-->`);
      const each_array_3 = ensure_array_like([
        ["none", "None"],
        ["url", "URL"],
        ["file", "PDF File"],
        ["intent", "Intent"]
      ]);
      for (let $$index_2 = 0, $$length2 = each_array_3.length; $$index_2 < $$length2; $$index_2++) {
        let [value, label] = each_array_3[$$index_2];
        $$renderer2.push(`<button${attr_class("segment-btn small svelte-1njc2kt", void 0, { "selected": task.linkType === value })}>${escape_html(label)}</button>`);
      }
      $$renderer2.push(`<!--]--></div></div> `);
      if (task.linkType === "file") {
        $$renderer2.push(`<!--[0--><div class="field svelte-1njc2kt"><span class="body-medium field-hint svelte-1njc2kt">Offline PDF Document</span> <div class="file-picker-container svelte-1njc2kt"><input type="file" accept="application/pdf,.pdf"${attr("id", `file-input-${stringify(task.key)}`)} class="file-input-hidden svelte-1njc2kt"/> <label${attr("for", `file-input-${stringify(task.key)}`)} class="file-picker-btn svelte-1njc2kt">📎 ${escape_html(task.fileName ? "Change PDF File" : "Choose PDF File")}</label> `);
        if (task.fileName) {
          $$renderer2.push(`<!--[0--><div class="file-info-badge svelte-1njc2kt"><span class="file-name svelte-1njc2kt">📄 ${escape_html(task.fileName)}</span> `);
          if (task.fileSize) {
            $$renderer2.push(`<!--[0--><span class="file-size label-medium svelte-1njc2kt">(${escape_html(formatFileSize(task.fileSize))})</span>`);
          } else {
            $$renderer2.push("<!--[-1-->");
          }
          $$renderer2.push(`<!--]--></div>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></div></div> <label class="field svelte-1njc2kt"><span class="body-medium field-hint svelte-1njc2kt">Starting PDF Page Number (optional)</span> <input type="number" class="text-input small-input svelte-1njc2kt" min="1" placeholder="1"${attr("value", task.pdfPage)}/></label>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (task.linkType === "url" || task.linkType === "intent") {
        $$renderer2.push(`<!--[0--><label class="field svelte-1njc2kt"><span class="body-medium field-hint svelte-1njc2kt">URL</span> <input type="url" class="text-input svelte-1njc2kt" placeholder="https://..."${attr("value", task.linkUrl)}/></label> `);
        if (isYouTubeUrl(task.linkUrl)) {
          $$renderer2.push(`<!--[0--><label class="field svelte-1njc2kt"><span class="body-medium field-hint svelte-1njc2kt">YouTube Timestamp (seconds, leave empty for YT history)</span> <input type="number" class="text-input small-input svelte-1njc2kt" min="0" placeholder="0"${attr("value", task.ytTimestamp)}/></label>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (isPdfUrl(task.linkUrl)) {
          $$renderer2.push(`<!--[0--><label class="field svelte-1njc2kt"><span class="body-medium field-hint svelte-1njc2kt">PDF Page Number</span> <input type="number" class="text-input small-input svelte-1njc2kt" min="1" placeholder="1"${attr("value", task.pdfPage)}/></label>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="actions svelte-1njc2kt"><button class="btn btn-text svelte-1njc2kt">Cancel</button> <button class="btn btn-filled svelte-1njc2kt"${attr("disabled", !canSave(), true)}>${escape_html("Save Routine")}</button></div></div>`);
  });
}
export {
  _page as default
};
