# Claude Instructions for Vote Tracking Project

## Important: Do NOT Start the Web Application

- NEVER run `npm run dev`, `npm start`, or any other commands to start the web application after making edits
- Let the user run the application themselves when they want to test it
- Instead of starting the app to verify functionality, create and run tests

## Testing Strategy

- For any new functionality you implement, create appropriate tests
- Run existing tests to verify changes don't break anything
- Use tests to validate that your code changes work correctly
- Prefer unit tests and integration tests over manual testing via the running application

## Commands to Use Instead

- Run tests: Check package.json for test scripts
- Run linting/type checking: Use available lint and typecheck commands
- Build the project: Use build commands to verify compilation

This approach ensures faster feedback and more reliable verification of changes without the overhead of starting the full application.