package edu.cs3300;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

// This controller provides an endpoint to retrieve the Google Maps API key from the application configuration.
@RestController
public class MapConfigController {
    private final String apiKey;

    // Constructor that injects the Google Maps API key from the application properties.
    public MapConfigController(@Value("${GOOGLE_MAPS_API_KEY:}") String apiKey) {
        this.apiKey = apiKey;
    }

    // Endpoint to retrieve the Google Maps API key. Returns a 503 Service Unavailable status if the key is not configured.
    @GetMapping("/api/map-config")
    public ResponseEntity<Map<String, String>> getMapConfig() {
        if (apiKey.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Google Maps API key is not configured."));
        }
        return ResponseEntity.ok(Map.of("apiKey", apiKey));
    }
}
