/*! coi-serviceworker v0.1.7 - MIT License - https://github.com/gzuidhof/coi-serviceworker */
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("fetch", (event) => {
        const { request } = event;
        
        // Skip interception for the local engine server to avoid console noise when it's down
        if (request.url.includes(":3001")) {
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
                    newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => {
                    // If fetch fails (e.g. server down), we MUST return a valid Response or let it fail naturally.
                    // Returning undefined here causes "Failed to convert value to 'Response'".
                    // We throw the error so the browser handles the fetch failure normally.
                    throw e;
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
                    registration.installing.addEventListener("statechange", () => {
                        if (registration.installing.state === "installed") {
                            console.log("Service worker installed, reloading for COI...");
                            if (coi.shouldReload()) location.reload();
                        }
                    });
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
