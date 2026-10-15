const MAPS_SCRIPT_MARKER = "data-locallens-google-maps";
const MAX_LOAD_ATTEMPTS = 3;
const RETRY_DELAY_MS = 250;

let mapsLoadPromise;
let mapsScript;

function normalized_error(error, fallback) {
    return error instanceof Error ? error : new Error(fallback);
}

function find_maps_script() {
    return mapsScript || document.querySelector?.(`script[${MAPS_SCRIPT_MARKER}]`) || null;
}

function remove_maps_script(script) {
    if (!script) return;
    script.onload = null;
    script.onerror = null;
    script.remove?.();
    if (mapsScript === script) mapsScript = null;
}

function wait_for_maps_script(script) {
    return new Promise((resolve, reject) => {
        const onload = () => {
            script.onload = null;
            script.onerror = null;
            resolve();
        };
        const onerror = () => {
            script.onload = null;
            script.onerror = null;
            reject(new Error("Google Maps failed to load."));
        };

        script.onload = onload;
        script.onerror = onerror;
    });
}

async function load_maps_script(scriptUrl) {
    let script = find_maps_script();
    if (!script) {
        script = document.createElement("script");
        script.async = true;
        script.setAttribute(MAPS_SCRIPT_MARKER, "true");
        mapsScript = script;
        script.src = scriptUrl;
        const loading = wait_for_maps_script(script);
        document.head.append(script);
        return loading;
    }

    mapsScript = script;
    script.src = scriptUrl;
    return wait_for_maps_script(script);
}

async function load_once() {
    const response = await fetch("/api/map-config");
    const config = await response.json().catch(() => ({}));
    if (!response.ok || typeof config.apiKey !== "string" || !config.apiKey.trim()) {
        throw new Error(config.error || "Google Maps configuration is unavailable.");
    }

    const scriptUrl = new URL("https://maps.googleapis.com/maps/api/js");
    scriptUrl.searchParams.set("loading", "async");
    scriptUrl.searchParams.set("key", config.apiKey);
    scriptUrl.searchParams.set("libraries", "maps,marker,places");

    try {
        await load_maps_script(scriptUrl.toString());
    } catch (error) {
        // A failed script element cannot be reliably reused by the browser. Remove
        // it before the next bounded attempt so retries never stack script tags.
        remove_maps_script(mapsScript);
        throw normalized_error(error, "Google Maps failed to load.");
    }
}

function wait_before_retry(delayMs) {
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

async function load_with_retries(retryDelayMs) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_LOAD_ATTEMPTS; attempt++) {
        try {
            await load_once();
            return;
        } catch (error) {
            lastError = normalized_error(error, "Google Maps failed to load.");
            if (attempt === MAX_LOAD_ATTEMPTS) break;
            await wait_before_retry(retryDelayMs * attempt);
        }
    }
    throw lastError || new Error("Google Maps failed to load.");
}

export function loadGoogleMaps({ retryDelayMs = RETRY_DELAY_MS } = {}) {
    if (window.google?.maps?.importLibrary) return Promise.resolve();
    if (mapsLoadPromise) return mapsLoadPromise;

    const delay = Number.isFinite(retryDelayMs) && retryDelayMs >= 0
        ? retryDelayMs
        : RETRY_DELAY_MS;
    mapsLoadPromise = load_with_retries(delay).finally(() => {
        // Successful calls are cheap after the API is present; failed calls must
        // be allowed to start a fresh bounded sequence on the next request.
        mapsLoadPromise = null;
    });
    return mapsLoadPromise;
}
