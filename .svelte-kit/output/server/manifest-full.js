export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["favicon.svg","pwa-192x192.svg","pwa-512x512.svg"]),
	mimeTypes: {".svg":"image/svg+xml"},
	_: {
		client: {start:"_app/immutable/entry/start.CEZfQsq5.js",app:"_app/immutable/entry/app.zjs8ANmJ.js",imports:["_app/immutable/entry/start.CEZfQsq5.js","_app/immutable/chunks/DcaShs8O.js","_app/immutable/chunks/kKevzSqW.js","_app/immutable/chunks/D8bl1G0l.js","_app/immutable/chunks/D6bjTiC3.js","_app/immutable/chunks/b4I3Xpo0.js","_app/immutable/entry/app.zjs8ANmJ.js","_app/immutable/chunks/C1FmrZbK.js","_app/immutable/chunks/kKevzSqW.js","_app/immutable/chunks/C-EcCL_A.js","_app/immutable/chunks/b4I3Xpo0.js","_app/immutable/chunks/Djx_ixZy.js","_app/immutable/chunks/7eAEXm0t.js","_app/immutable/chunks/D04VjmpB.js","_app/immutable/chunks/D8bl1G0l.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js')),
			__memo(() => import('./nodes/3.js')),
			__memo(() => import('./nodes/4.js')),
			__memo(() => import('./nodes/5.js')),
			__memo(() => import('./nodes/6.js')),
			__memo(() => import('./nodes/7.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/history",
				pattern: /^\/history\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/routines",
				pattern: /^\/routines\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/routines/new",
				pattern: /^\/routines\/new\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/routines/[id]",
				pattern: /^\/routines\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 6 },
				endpoint: null
			},
			{
				id: "/routines/[id]/session",
				pattern: /^\/routines\/([^/]+?)\/session\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 7 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
