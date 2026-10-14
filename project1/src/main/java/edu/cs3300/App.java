package edu.cs3300;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
// Main application class that serves as the entry point for the Spring Boot application.
// This serves as the starting point for the application, initializing the Spring context and starting the embedded server.
@SpringBootApplication
public class App {
    public static void main(String[] args) {
        SpringApplication.run(App.class, args);
    }
}
