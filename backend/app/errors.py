"""Domain errors raised by services and mapped to HTTP responses in main.py."""


class AppError(Exception):
    """Base error carrying an HTTP status code and a user-safe message."""

    status_code: int = 400

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class BadRequest(AppError):
    """Invalid input that passed schema validation."""

    status_code = 400


class Unauthorized(AppError):
    """Bad credentials."""

    status_code = 401


class Forbidden(AppError):
    """Authenticated but not allowed."""

    status_code = 403


class NotFound(AppError):
    """Resource missing or not visible to this user."""

    status_code = 404


class Conflict(AppError):
    """State conflict (duplicate email, busy callee, call already answered)."""

    status_code = 409
