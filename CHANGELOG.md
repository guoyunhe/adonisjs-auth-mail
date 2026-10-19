# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-10-19

### Added

- Email verification with expiring, purpose-bound tokens and a `withEmailVerification` user mixin.
- A `verified` middleware for protecting routes from users who have not verified their email.
- Password reset with expiring, purpose-bound tokens, hashed token storage, one-time consumption, and configurable email throttling.
- `node ace add adonisjs-auth-mail` setup that generates configuration, models, validators, controllers, migrations, mail views, and middleware registration.
- Configurable email templates, token lifetimes, and URL paths for verification and password reset.
