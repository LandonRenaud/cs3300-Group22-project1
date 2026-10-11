let mapsLoadPromise;

export function loadGoogleMaps() {
    if (window.google?.maps?.importLibrary) return Promise.resolve();
    if (mapsLoadPromise) return mapsLoadPromise;

    mapsLoadPromise = (async () => {
        const response = await fetch("/api/map-config");
        const config = await response.json().catch(() => ({}));
        if (!response.ok || typeof config.apiKey !== "string" || !config.apiKey.trim()) {
            throw new Error(config.error || "Google Maps configuration is unavailable.");
        }

        const scriptUrl = new URL("https://maps.googleapis.com/maps/api/js");
        scriptUrl.searchParams.set("loading", "async");
        scriptUrl.searchParams.set("key", config.apiKey);
        scriptUrl.searchParams.set("libraries", "maps,marker,places");

        await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.async = true;
            script.src = scriptUrl.toString();
            script.onload = resolve;
            script.onerror = () => reject(new Error("Google Maps failed to load."));
            document.head.append(script);
        });
    })().catch(error => {
        mapsLoadPromise = null;
        throw error;
    });

    return mapsLoadPromise;
}
