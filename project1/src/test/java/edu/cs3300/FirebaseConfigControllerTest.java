package edu.cs3300;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "FIREBASE_API_KEY=test-browser-key")
@AutoConfigureMockMvc
class FirebaseConfigControllerTest {
    @Autowired
    private MockMvc mockMvc;

    @Test
    void returnsConfiguredFirebaseApiKey() throws Exception {
        mockMvc.perform(get("/api/firebase-config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.apiKey").value("test-browser-key"));
    }
}