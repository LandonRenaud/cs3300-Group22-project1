package edu.cs3300;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class FirebaseConfigControllerUnitTest {
    @Test
    void includesDatabaseUrlWhenConfigured() {
        FirebaseConfigController controller = new FirebaseConfigController("browser-key", "https://reviews.example.test");

        ResponseEntity<Map<String, String>> response = controller.getFirebaseConfig();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(Map.of("apiKey", "browser-key", "databaseUrl", "https://reviews.example.test"), response.getBody());
    }

    @Test
    void keepsAuthenticationConfigAvailableWhenDatabaseUrlIsNotConfigured() {
        FirebaseConfigController controller = new FirebaseConfigController("browser-key", " ");

        ResponseEntity<Map<String, String>> response = controller.getFirebaseConfig();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(Map.of("apiKey", "browser-key"), response.getBody());
    }

    @Test
    void reportsUnavailableWhenApiKeyIsMissing() {
        FirebaseConfigController controller = new FirebaseConfigController("", "https://reviews.example.test");

        ResponseEntity<Map<String, String>> response = controller.getFirebaseConfig();

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
        assertTrue(response.getBody().containsKey("error"));
    }
}
