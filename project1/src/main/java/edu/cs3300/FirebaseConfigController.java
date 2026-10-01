package edu.cs3300;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FirebaseConfigController {
    private final String apiKey;

    public FirebaseConfigController(@Value("${FIREBASE_API_KEY:}") String apiKey) {
        this.apiKey = apiKey;
    }

    @GetMapping("/api/firebase-config")
    public ResponseEntity<Map<String, String>> getFirebaseConfig() {
        if (apiKey.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Firebase API key is not configured."));
        }
        return ResponseEntity.ok(Map.of("apiKey", apiKey));
    }
}