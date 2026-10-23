/*! coi-serviceworker v0.1.7 - MIT License - https://github.com/gzuidhof/coi-serviceworker */
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("fetch", (event) => {
        const { request } = event;

        // Skip interception for these requests (avoids console noise and needless
        // proxying):
        //  - :3001            local engine server (when it's down)
        //  - gc.zgo.at        GoatCounter script
        //  - goatcounter.com  GoatCounter tracking beacon
        if (
            request.url.includes(":3001") ||
            request.url.includes("gc.zgo.at") ||
            request.url.includes("goatcounter.com")
        ) {
            return;
        }

        if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
            return;
        }

        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.status === 0) {
                        return response;
                    }

                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy", "credentialless");
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch(() => {
                    // Return a clean network-error Response instead of re-throwing.
                    // A rejected respondWith() promise surfaces as an uncaught
                    // promise rejection in the console for EVERY failed request
                    // (ad-blocked trackers, offline third parties, etc.), which is
                    // pure noise. Response.error() still fails the request cleanly.
                    return Response.error();
                })
        );
    });
} else {
    (() => {
        const script = document.currentScript;
        const coi = {
            shouldRegister: () => true,
            shouldReload: () => true,
            doNotReload: false,
            quiet: false,
            ...window.coi
        };

        const isAreWorksersEnabled = ("serviceWorker" in navigator);

        if (isAreWorksersEnabled && coi.shouldRegister()) {
            navigator.serviceWorker.register(script.src).then((registration) => {
                registration.addEventListener("updatefound", () => {
                    const worker = registration.installing;
                    if (worker) {
                        worker.addEventListener("statechange", () => {
                            if (worker.state === "installed") {
                                console.log("Service worker installed, reloading for COI...");
                                if (coi.shouldReload()) location.reload();
                            }
                        });
                    }
                });

                if (registration.active && !navigator.serviceWorker.controller) {
                    console.log("Service worker active but not controlling, reloading for COI...");
                    if (coi.shouldReload()) {
                        location.reload();
                    }
                }
            }, (err) => {
                !coi.quiet && console.error("COI-ServiceWorker registration failed: ", err);
            });
        }
    })();
}
