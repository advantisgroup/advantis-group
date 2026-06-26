module.exports = [
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/tags-manifest.external.js [external] (next/dist/server/lib/incremental-cache/tags-manifest.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/tags-manifest.external.js", () => require("next/dist/server/lib/incremental-cache/tags-manifest.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
}),
"[externals]/node:crypto [external] (node:crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:crypto", () => require("node:crypto"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[project]/apps/marketing/src/i18n/request.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__,
    "defaultLocale",
    ()=>defaultLocale,
    "locales",
    ()=>locales
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$server$2f$react$2d$server$2f$getRequestConfig$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__default__as__getRequestConfig$3e$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/server/react-server/getRequestConfig.js [middleware] (ecmascript) <export default as getRequestConfig>");
;
const locales = [
    "de",
    "en",
    "zh",
    "fr"
];
const defaultLocale = "de";
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$server$2f$react$2d$server$2f$getRequestConfig$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__$3c$export__default__as__getRequestConfig$3e$__["getRequestConfig"])(async ({ locale })=>{
    const resolvedLocale = locale ?? defaultLocale;
    return {
        locale: resolvedLocale,
        messages: (await __turbopack_context__.f({
            "./messages/de.json": {
                id: ()=>"[project]/apps/marketing/src/i18n/messages/de.json (json, async loader)",
                module: ()=>__turbopack_context__.A("[project]/apps/marketing/src/i18n/messages/de.json (json, async loader)")
            },
            "./messages/en.json": {
                id: ()=>"[project]/apps/marketing/src/i18n/messages/en.json (json, async loader)",
                module: ()=>__turbopack_context__.A("[project]/apps/marketing/src/i18n/messages/en.json (json, async loader)")
            },
            "./messages/fr.json": {
                id: ()=>"[project]/apps/marketing/src/i18n/messages/fr.json (json, async loader)",
                module: ()=>__turbopack_context__.A("[project]/apps/marketing/src/i18n/messages/fr.json (json, async loader)")
            },
            "./messages/zh.json": {
                id: ()=>"[project]/apps/marketing/src/i18n/messages/zh.json (json, async loader)",
                module: ()=>__turbopack_context__.A("[project]/apps/marketing/src/i18n/messages/zh.json (json, async loader)")
            }
        }).import(`./messages/${resolvedLocale}.json`)).default
    };
});
}),
"[project]/apps/marketing/src/proxy.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "config",
    ()=>config,
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$nextjs$2f$dist$2f$esm$2f$server$2f$clerkMiddleware$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/@clerk/nextjs/dist/esm/server/clerkMiddleware.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$middleware$2f$middleware$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next-intl/dist/esm/development/middleware/middleware.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$marketing$2f$src$2f$i18n$2f$request$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/marketing/src/i18n/request.ts [middleware] (ecmascript)");
;
;
;
const intlMiddleware = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2d$intl$2f$dist$2f$esm$2f$development$2f$middleware$2f$middleware$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["default"])({
    locales: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$marketing$2f$src$2f$i18n$2f$request$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["locales"],
    defaultLocale: __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$marketing$2f$src$2f$i18n$2f$request$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["defaultLocale"],
    localePrefix: "always"
});
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f40$clerk$2f$nextjs$2f$dist$2f$esm$2f$server$2f$clerkMiddleware$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["clerkMiddleware"])((_auth, req)=>{
    const pathname = req.nextUrl.pathname;
    if (pathname.startsWith("/api") || pathname.startsWith("/trpc") || pathname.startsWith("/ingest")) {
        return;
    }
    return intlMiddleware(req);
});
const config = {
    matcher: [
        "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)"
    ]
};
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__a1866317._.js.map